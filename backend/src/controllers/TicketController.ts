import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import { Op } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import ContactCustomField from "../models/ContactCustomField";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date: string;
  showAll: string;
  withUnreadMessages: string;
  queueIds: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  /*===================================  INICIO ===================================
      Verifica se existe algum retorno agendado para hoje, caso exista cria uma notificação
    */
  if (showAll == null) {

    var dataHoje = new Date();
    var dataFormatString = dataHoje.toISOString().substr(0, 10).split('-').reverse().join('/');
    var dataFormatMysql = dataHoje.toISOString().slice(0, 10);

    const customField = await ContactCustomField.findAll({
      where: { name: "Data de retorno", value: dataFormatString }
    });

    customField.forEach(async (item) => {

      // Monta o Request
      var body = req.body;
      body.status = "open";
      body.contactId = item.contactId;
      body.userId = req.user.id;
      const { contactId, status, userId }: TicketData = body;

      // Busca a conexão do Whatsapp padrão
      const defaultWhatsapp = await Whatsapp.findOne({
        where: { isDefault: true }
      });

      // Busca as filas cadastradas para o Whatsapp padrão, e define a 3º Fila como Padrão
      const { queues } = await ShowWhatsAppService(defaultWhatsapp?.id!);
      const choosenQueue = queues[2];

      // Só deve permitir criar o ticket para a fila de retorno, caso não existe um ticket criado na data de hoje para o usuario
      const ticket = await Ticket.findOne({
        where: { contactId: contactId, status: { [Op.or]: ["open", "closed"] }, queueId: choosenQueue.id, createdAt: {[Op.between]: [+startOfDay(parseISO(dataFormatMysql)), +endOfDay(parseISO(dataFormatMysql))]} }
      });

      // Só deve criar caso não ache um ticket com as condições acima
      if (ticket == null) {

        // Cria o ticket 
        const ticketCriado = await CreateTicketService({ contactId, status, userId });

        // Joga o ticket para a fila de retorno
        UpdateTicketService({
          ticketData: { queueId: choosenQueue.id },
          ticketId: ticketCriado.id
        });
      }
    });
  }
  //====================================  FIM =====================================



  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    pageNumber,
    status,
    date,
    showAll,
    userId,
    queueIds,
    withUnreadMessages
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId }: TicketData = req.body;

  const ticket = await CreateTicketService({ contactId, status, userId });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const contact = await ShowTicketService(ticketId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const ticketData: TicketData = req.body;

  const { ticket } = await UpdateTicketService({
    ticketData,
    ticketId
  });

  if (ticket.status === "closed") {
    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    const { farewellMessage } = whatsapp;

    if (farewellMessage) {
      await SendWhatsAppMessage({
        body: farewellMessage,
        ticket
      });
    }
  }


  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  io.to(ticket.status)
    .to(ticketId)
    .to("notification")
    .emit("ticket", {
      action: "delete",
      ticketId: +ticketId
    });

  return res.status(200).json({ message: "ticket deleted" });
};
