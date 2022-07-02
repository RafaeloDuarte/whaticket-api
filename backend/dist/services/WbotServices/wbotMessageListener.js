"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessage = exports.wbotMessageListener = void 0;
const path_1 = require("path");
const util_1 = require("util");
const fs_1 = require("fs");
const Sentry = __importStar(require("@sentry/node"));
const Contact_1 = __importDefault(require("../../models/Contact"));
const Message_1 = __importDefault(require("../../models/Message"));
const socket_1 = require("../../libs/socket");
const CreateMessageService_1 = __importDefault(require("../MessageServices/CreateMessageService"));
const logger_1 = require("../../utils/logger");
const CreateOrUpdateContactService_1 = __importDefault(require("../ContactServices/CreateOrUpdateContactService"));
const FindOrCreateTicketService_1 = __importDefault(require("../TicketServices/FindOrCreateTicketService"));
const ShowWhatsAppService_1 = __importDefault(require("../WhatsappService/ShowWhatsAppService"));
const Debounce_1 = require("../../helpers/Debounce");
const UpdateTicketService_1 = __importDefault(require("../TicketServices/UpdateTicketService"));
var typePergunta = 1;
var respostaList = [
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
const writeFileAsync = util_1.promisify(fs_1.writeFile);
const verifyContact = (msgContact) => __awaiter(void 0, void 0, void 0, function* () {
    const profilePicUrl = yield msgContact.getProfilePicUrl();
    const contactData = {
        name: msgContact.name || msgContact.pushname || msgContact.id.user,
        number: msgContact.id.user,
        profilePicUrl,
        isGroup: msgContact.isGroup
    };
    const contact = CreateOrUpdateContactService_1.default(contactData);
    return contact;
});
const verifyQuotedMessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    if (!msg.hasQuotedMsg)
        return null;
    const wbotQuotedMsg = yield msg.getQuotedMessage();
    const quotedMsg = yield Message_1.default.findOne({
        where: { id: wbotQuotedMsg.id.id }
    });
    if (!quotedMsg)
        return null;
    return quotedMsg;
});
const verifyMediaMessage = (msg, ticket, contact) => __awaiter(void 0, void 0, void 0, function* () {
    const quotedMsg = yield verifyQuotedMessage(msg);
    const media = yield msg.downloadMedia();
    if (!media) {
        throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }
    if (!media.filename) {
        const ext = media.mimetype.split("/")[1].split(";")[0];
        media.filename = `${new Date().getTime()}.${ext}`;
    }
    try {
        yield writeFileAsync(path_1.join(__dirname, "..", "..", "..", "public", media.filename), media.data, "base64");
    }
    catch (err) {
        Sentry.captureException(err);
        logger_1.logger.error(`Error verifyMediaMessage: Err: ${err}`);
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
        quotedMsgId: quotedMsg === null || quotedMsg === void 0 ? void 0 : quotedMsg.id
    };
    yield ticket.update({ lastMessage: msg.body || media.filename });
    const newMessage = yield CreateMessageService_1.default({ messageData });
    return newMessage;
});
const verifyMessage = (msg, ticket, contact) => __awaiter(void 0, void 0, void 0, function* () {
    const quotedMsg = yield verifyQuotedMessage(msg);
    const messageData = {
        id: msg.id.id,
        ticketId: ticket.id,
        contactId: msg.fromMe ? undefined : contact.id,
        body: msg.body,
        fromMe: msg.fromMe,
        mediaType: msg.type,
        read: msg.fromMe,
        quotedMsgId: quotedMsg === null || quotedMsg === void 0 ? void 0 : quotedMsg.id
    };
    yield ticket.update({ lastMessage: msg.body });
    yield CreateMessageService_1.default({ messageData });
});
const verifyQueue = (wbot, msg, ticket, contact) => __awaiter(void 0, void 0, void 0, function* () {
    const { queues, greetingMessage } = yield ShowWhatsAppService_1.default(wbot.id);
    if (queues.length === 1) {
        yield UpdateTicketService_1.default({
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
        }
        else {
            contadorMsg.push({ ticketId: ticket.id, count: 1 });
        }
        let body = `\u200e${greetingMessage}`;
        const debouncedSentMessage = Debounce_1.debounce(() => __awaiter(void 0, void 0, void 0, function* () {
            const sentMessage = yield wbot.sendMessage(`${contact.number}@c.us`, body);
            verifyMessage(sentMessage, ticket, contact);
        }), 3000, ticket.id);
        debouncedSentMessage();
    }
    else {
        respostaList[result.count - 1].resposta = msg.body;
        if (respostaList[1].resposta == "2") {
            typePergunta = 2;
        }
        else {
            typePergunta = 1;
        }
        /*
          Encaminha para a fila de atendimento, caso:
            - Ja tenha respondido o questionário antes
            - Respondeu todas as perguntas da lista
        */
        if (result.count == respostaList.length || contact.answered == "Sim") {
            yield UpdateTicketService_1.default({
                ticketData: { queueId: choosenQueue.id },
                ticketId: ticket.id
            });
            const body = `\u200e${choosenQueue.greetingMessage}`;
            const sentMessage = yield wbot.sendMessage(`${contact.number}@c.us`, body);
            yield verifyMessage(sentMessage, ticket, contact);
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
            if (contact.answered == "Não") {
                yield Contact_1.default.upsert({
                    target: respostaList[1].resposta == "1" ? "PARA MIM MESMO" : "PARA FAMILIAR",
                    typeTreatment: typeTreatmentCase,
                    sex: respostaList[3].resposta == "1" ? "Homen" : "Mulher",
                    availability: respostaList[4].resposta == "1" ? "Sim" : "Não",
                    zipCode: respostaList[5].resposta,
                    insurance: respostaList[6].resposta == "1" ? "Sim" : "Não",
                    caseDescription: respostaList[7].resposta,
                    answered: "Sim",
                    id: contact.id
                });
            }
            respostaList.forEach((item) => {
                item.resposta = "";
            });
            typePergunta = 1;
        }
        else {
            let body = respostaList[result.count].pergunta.split("|")[typePergunta - 1];
            result.count = result.count + 1;
            const debouncedSentMessage = Debounce_1.debounce(() => __awaiter(void 0, void 0, void 0, function* () {
                const sentMessage = yield wbot.sendMessage(`${contact.number}@c.us`, body);
                verifyMessage(sentMessage, ticket, contact);
            }), 3000, ticket.id);
            debouncedSentMessage();
        }
    }
});
const isValidMsg = (msg) => {
    if (msg.from === "status@broadcast")
        return false;
    if (msg.type === "chat" ||
        msg.type === "audio" ||
        msg.type === "ptt" ||
        msg.type === "video" ||
        msg.type === "image" ||
        msg.type === "document" ||
        msg.type === "vcard" ||
        msg.type === "sticker")
        return true;
    return false;
};
const handleMessage = (msg, wbot) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isValidMsg(msg)) {
        return;
    }
    try {
        let msgContact;
        let groupContact;
        if (msg.fromMe) {
            // messages sent automatically by wbot have a special character in front of it
            // if so, this message was already been stored in database;
            if (/\u200e/.test(msg.body[0]))
                return;
            // media messages sent from me from cell phone, first comes with "hasMedia = false" and type = "image/ptt/etc"
            // in this case, return and let this message be handled by "media_uploaded" event, when it will have "hasMedia = true"
            if (!msg.hasMedia && msg.type !== "chat" && msg.type !== "vcard")
                return;
            msgContact = yield wbot.getContactById(msg.to);
        }
        else {
            msgContact = yield msg.getContact();
        }
        const chat = yield msg.getChat();
        if (chat.isGroup) {
            let msgGroupContact;
            if (msg.fromMe) {
                msgGroupContact = yield wbot.getContactById(msg.to);
            }
            else {
                msgGroupContact = yield wbot.getContactById(msg.from);
            }
            groupContact = yield verifyContact(msgGroupContact);
        }
        const whatsapp = yield ShowWhatsAppService_1.default(wbot.id);
        const unreadMessages = msg.fromMe ? 0 : chat.unreadCount;
        const contact = yield verifyContact(msgContact);
        if (unreadMessages === 0 && whatsapp.farewellMessage === msg.body)
            return;
        const ticket = yield FindOrCreateTicketService_1.default(contact, wbot.id, unreadMessages, groupContact);
        if (msg.hasMedia) {
            yield verifyMediaMessage(msg, ticket, contact);
        }
        else {
            yield verifyMessage(msg, ticket, contact);
        }
        if (!ticket.queue &&
            !chat.isGroup &&
            !msg.fromMe &&
            !ticket.userId &&
            whatsapp.queues.length >= 1) {
            yield verifyQueue(wbot, msg, ticket, contact);
        }
    }
    catch (err) {
        Sentry.captureException(err);
        logger_1.logger.error(`Error handling whatsapp message: Err: ${err}`);
    }
});
exports.handleMessage = handleMessage;
const handleMsgAck = (msg, ack) => __awaiter(void 0, void 0, void 0, function* () {
    yield new Promise(r => setTimeout(r, 500));
    const io = socket_1.getIO();
    try {
        const messageToUpdate = yield Message_1.default.findByPk(msg.id.id, {
            include: [
                "contact",
                {
                    model: Message_1.default,
                    as: "quotedMsg",
                    include: ["contact"]
                }
            ]
        });
        if (!messageToUpdate) {
            return;
        }
        yield messageToUpdate.update({ ack });
        io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
            action: "update",
            message: messageToUpdate
        });
    }
    catch (err) {
        Sentry.captureException(err);
        logger_1.logger.error(`Error handling message ack. Err: ${err}`);
    }
});
const wbotMessageListener = (wbot) => {
    wbot.on("message_create", (msg) => __awaiter(void 0, void 0, void 0, function* () {
        handleMessage(msg, wbot);
    }));
    wbot.on("media_uploaded", (msg) => __awaiter(void 0, void 0, void 0, function* () {
        handleMessage(msg, wbot);
    }));
    wbot.on("message_ack", (msg, ack) => __awaiter(void 0, void 0, void 0, function* () {
        handleMsgAck(msg, ack);
    }));
};
exports.wbotMessageListener = wbotMessageListener;
