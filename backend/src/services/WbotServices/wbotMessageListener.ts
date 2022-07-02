import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import * as Sentry from "@sentry/node";

import {
  Contact as WbotContact,
  Message as WbotMessage,
  MessageAck,
  Client
} from "whatsapp-web.js";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";

import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { debounce } from "../../helpers/Debounce";
import UpdateTicketService from "../TicketServices/UpdateTicketService";

interface Session extends Client {
  id?: number;
}

var typePergunta = 1;
var respostaList= [
  { pergunta: 'Qual o seu *nome* por gentileza?', resposta: '' },
 
  { pergunta: 'Muito prazer! Este tratamento é para você mesmo(a) ou para familiar? \n 1 – PARA MIM MESMO \n 2 – PARA FAMILIAR', resposta: '' },
  { pergunta: 'E qual o tipo de tratamento você busca? \n 1 – DEPENDENCIA QUÍMICA \n 2 – TRANSTORNOS MENTAIS \n 3 – TRANSTORNOS MENTAIS E DEPENDENCIA QUÍMICA \n 4 – CASA DE REPOUSO \n 5 – MORADIA ASSISTIDA | E qual o tipo de tratamento você busca? \n 1 – DEPENDENCIA QUÍMICA \n 2 – TRANSTORNOS MENTAIS \n 3 – TRANSTORNOS MENTAIS E DEPENDENCIA QUÍMICA \n 4 – CASA DE REPOUSO \n 5 – MORADIA ASSISTIDA', resposta: '' },
  { pergunta: 'E qual gênero você se identifica? \n 1 – HOMEM \n 2 - MULHER | E qual gênero da pessoa que precisa de tratamento? \n 1 – HOMEM \n 2 - MULHER', resposta: '' },
  { pergunta: 'Você consegue ir até a unidade? | Você consegue levar o(a) paciente até a unidade? \n 1 – SIM \n 2 – NÃO', resposta: '' },
  { pergunta: 'Me informe por gentileza o endereço ou CEP de onde você se encontra para que eu possa analisar qual unidade mais próxima irá atender melhor o seu caso: | Me informe por gentileza o endereço ou CEP de onde a pessoa que precisa de ajuda se encontra no momento para que eu possa analisar qual unidade mais próxima irá atender melhor ao caso:', resposta: '' },
  { pergunta: 'Você busca tratamento PARTICULAR ou através de CONVÊNIO MÉDICO? \n 1 – PARTICULAR \n 2 – CONVENIO MÉDICO | Você busca tratamento PARTICULAR ou através de CONVÊNIO MÉDICO? \n 1 – PARTICULAR \n 2 – CONVENIO MÉDICO', resposta: '' },
  { pergunta: 'Faça um breve relato sobre o seu caso. Logo em seguida, nossa equipe de atendentes irá prestar todo suporte a você! Você está no caminho certo para recuperação! 🙏 | Faça um breve relato sobre o caso da pessoa que está buscando ajuda. Logo em seguida, nossa equipe de atendentes irá prestar todo suporte a você! Você está no caminho certo para recuperação! 🙏', resposta: '' }
];

var contadorMsg = new Array();

const writeFileAsync = promisify(writeFile);

const verifyContact = async (msgContact: WbotContact): Promise<Contact> => {
  const profilePicUrl = await msgContact.getProfilePicUrl();

  const contactData = {
    name: msgContact.name || msgContact.pushname || msgContact.id.user,
    number: msgContact.id.user,
    profilePicUrl,
    isGroup: msgContact.isGroup
  };

  const contact = CreateOrUpdateContactService(contactData);

  return contact;
};

const verifyQuotedMessage = async (
  msg: WbotMessage
): Promise<Message | null> => {
  if (!msg.hasQuotedMsg) return null;

  const wbotQuotedMsg = await msg.getQuotedMessage();

  const quotedMsg = await Message.findOne({
    where: { id: wbotQuotedMsg.id.id }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

const verifyMediaMessage = async (
  msg: WbotMessage,
  ticket: Ticket,
  contact: Contact
): Promise<Message> => {
  const quotedMsg = await verifyQuotedMessage(msg);

  const media = await msg.downloadMedia();

  if (!media) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  if (!media.filename) {
    const ext = media.mimetype.split("/")[1].split(";")[0];
    media.filename = `${new Date().getTime()}.${ext}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "..", "public", media.filename),
      media.data,
      "base64"
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error verifyMediaMessage: Err: ${err}`);
  }

  const messageData = {
    id: msg.id.id,
    ticketId: ticket.id,
    contactId: msg.fromMe ? undefined : contact.id,
    body: msg.body || media.filename,
    fromMe: msg.fromMe,
    read: msg.fromMe,
    mediaUrl: media.filename,
    mediaType: media.mimetype.split("/")[0],
    quotedMsgId: quotedMsg?.id
  };

  await ticket.update({ lastMessage: msg.body || media.filename });
  const newMessage = await CreateMessageService({ messageData });

  return newMessage;
};

const verifyMessage = async (
  msg: WbotMessage,
  ticket: Ticket,
  contact: Contact
) => {

  const quotedMsg = await verifyQuotedMessage(msg);
  const messageData = {
    id: msg.id.id,
    ticketId: ticket.id,
    contactId: msg.fromMe ? undefined : contact.id,
    body: msg.body,
    fromMe: msg.fromMe,
    mediaType: msg.type,
    read: msg.fromMe,
    quotedMsgId: quotedMsg?.id
  };

  await ticket.update({ lastMessage: msg.body });

  await CreateMessageService({ messageData });
};

const verifyQueue = async (
  wbot: Session,
  msg: WbotMessage,
  ticket: Ticket,
  contact: Contact
) => {

  const { queues, greetingMessage } = await ShowWhatsAppService(wbot.id!);

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });

    return;
  }

  // Seleciona a fila "Fila criada" como default
  const choosenQueue = queues[1];
  const result = contadorMsg.find(ticketList => ticketList.ticketId === ticket.id);

  if (!result) {

    if (result) {
      result.count = result.count + 1;
    } else {
      contadorMsg.push({ ticketId: ticket.id, count: 1 });
    }

    let body = `\u200e${greetingMessage}`;

    const debouncedSentMessage = debounce(
      async () => {
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@c.us`,
          body
        );
        verifyMessage(sentMessage, ticket, contact);
      },
      3000,
      ticket.id
    );
    debouncedSentMessage();
  } else {

    respostaList[result.count - 1].resposta = msg.body;

    if(respostaList[1].resposta == "2"){
      typePergunta = 2;
    }else{
      typePergunta = 1;
    }

    /* 
      Encaminha para a fila de atendimento, caso: 
        - Ja tenha respondido o questionário antes 
        - Respondeu todas as perguntas da lista
    */
    if (result.count == respostaList.length || contact.answered == "Sim") {

      await UpdateTicketService({
        ticketData: { queueId: choosenQueue.id },
        ticketId: ticket.id
      });

      const body = `\u200e${choosenQueue.greetingMessage}`;
      const sentMessage = await wbot.sendMessage(`${contact.number}@c.us`, body);
      await verifyMessage(sentMessage, ticket, contact);

      var indiceContadorMsg = contadorMsg.findIndex(item => item.ticketId == ticket.id);
      contadorMsg.splice(indiceContadorMsg, 1);

      var typeTreatmentCase = respostaList[2].resposta;

      switch (typeTreatmentCase) {
        case "1":
          typeTreatmentCase = "DEPENDENCIA QUÍMICA";
          break;
        case "2":
          typeTreatmentCase = "TRANSTORNOS MENTAIS";
          break;
        case "3":
          typeTreatmentCase = "TRANSTORNOS MENTAIS E DEPENDENCIA QUÍMICA";
          break;
        case "4":
          typeTreatmentCase = "CASA DE REPOUSO";
          break;
        case "5":
          typeTreatmentCase = "MORADIA ASSISTIDA";
          break;
      }

      if(contact.answered == "Não"){
        await Contact.upsert({
          target: respostaList[1].resposta == "1"? "PARA MIM MESMO":"PARA FAMILIAR",
          typeTreatment: typeTreatmentCase,
          sex: respostaList[3].resposta == "1"? "Homen":"Mulher",
          availability: respostaList[4].resposta == "1"? "Sim":"Não",
          zipCode: respostaList[5].resposta,
          insurance: respostaList[6].resposta == "1"? "Sim":"Não",
          caseDescription: respostaList[7].resposta,
          answered: "Sim",
          id: contact.id
        });
      }      

      respostaList.forEach((item) => {
        item.resposta = "";
      });

      typePergunta = 1;

    } else {

      let body = respostaList[result.count].pergunta.split("|")[typePergunta - 1];
      result.count = result.count + 1;

      const debouncedSentMessage = debounce(
        async () => {
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@c.us`,
            body
          );
          verifyMessage(sentMessage, ticket, contact);
        },
        3000,
        ticket.id
      );
      debouncedSentMessage();
    }

  }
};

const isValidMsg = (msg: WbotMessage): boolean => {
  if (msg.from === "status@broadcast") return false;
  if (
    msg.type === "chat" ||
    msg.type === "audio" ||
    msg.type === "ptt" ||
    msg.type === "video" ||
    msg.type === "image" ||
    msg.type === "document" ||
    msg.type === "vcard" ||
    msg.type === "sticker"
  )
    return true;
  return false;
};

const handleMessage = async (
  msg: WbotMessage,
  wbot: Session
): Promise<void> => {
  if (!isValidMsg(msg)) {
    return;
  }

  try {
    let msgContact: WbotContact;
    let groupContact: Contact | undefined;

    if (msg.fromMe) {
      // messages sent automatically by wbot have a special character in front of it
      // if so, this message was already been stored in database;
      if (/\u200e/.test(msg.body[0])) return;

      // media messages sent from me from cell phone, first comes with "hasMedia = false" and type = "image/ptt/etc"
      // in this case, return and let this message be handled by "media_uploaded" event, when it will have "hasMedia = true"

      if (!msg.hasMedia && msg.type !== "chat" && msg.type !== "vcard") return;

      msgContact = await wbot.getContactById(msg.to);
    } else {
      msgContact = await msg.getContact();
    }

    const chat = await msg.getChat();


    if (chat.isGroup) {
      let msgGroupContact;

      if (msg.fromMe) {
        msgGroupContact = await wbot.getContactById(msg.to);
      } else {
        msgGroupContact = await wbot.getContactById(msg.from);
      }

      groupContact = await verifyContact(msgGroupContact);
    }
    const whatsapp = await ShowWhatsAppService(wbot.id!);

    const unreadMessages = msg.fromMe ? 0 : chat.unreadCount;

    const contact = await verifyContact(msgContact);

    if (unreadMessages === 0 && whatsapp.farewellMessage === msg.body) return;

    const ticket = await FindOrCreateTicketService(
      contact,
      wbot.id!,
      unreadMessages,
      groupContact
    );

    if (msg.hasMedia) {
      await verifyMediaMessage(msg, ticket, contact);
    } else {
      await verifyMessage(msg, ticket, contact);
    }

    if (
      !ticket.queue &&
      !chat.isGroup &&
      !msg.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1
    ) {
      await verifyQueue(wbot, msg, ticket, contact);
    }



  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling whatsapp message: Err: ${err}`);
  }
};

const handleMsgAck = async (msg: WbotMessage, ack: MessageAck) => {
  await new Promise(r => setTimeout(r, 500));

  const io = getIO();

  try {
    const messageToUpdate = await Message.findByPk(msg.id.id, {
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });
    if (!messageToUpdate) {
      return;
    }
    await messageToUpdate.update({ ack });

    io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
      action: "update",
      message: messageToUpdate
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack. Err: ${err}`);
  }
};

const wbotMessageListener = (wbot: Session): void => {
  wbot.on("message_create", async msg => {
    handleMessage(msg, wbot);
  });

  wbot.on("media_uploaded", async msg => {
    handleMessage(msg, wbot);
  });

  wbot.on("message_ack", async (msg, ack) => {
    handleMsgAck(msg, ack);
  });
};

export { wbotMessageListener, handleMessage };
