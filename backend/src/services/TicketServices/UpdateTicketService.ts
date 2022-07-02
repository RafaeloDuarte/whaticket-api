import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import ContactCustomField from "../../models/ContactCustomField";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowTicketService from "./ShowTicketService";
import Whatsapp from "../../models/Whatsapp";

interface TicketData {
  status?: string;
  userId?: number;
  queueId?: number;
}

interface Request {
  ticketData: TicketData;
  ticketId: string | number;
}

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

const UpdateTicketService = async ({
  ticketData,
  ticketId
}: Request): Promise<Response> => {
  const { status, userId, queueId } = ticketData;

  const ticket = await ShowTicketService(ticketId);
  await SetTicketMessagesAsRead(ticket);

  const oldStatus = ticket.status;
  const oldUserId = ticket.user?.id;

  if (oldStatus === "closed") {
    await CheckContactOpenTickets(ticket.contact.id);
  }

  if (ticket.status === "open") {
    
    const user = await User.findOne({
      where: { id: oldUserId }
    });

    /*
    const customField = await ContactCustomField.findOne({
      where: { contactId: ticket.contact.id, name: "Atendente" }
    });

    await ContactCustomField.upsert({ 
        name: "Atendente",
        value: user?.name,
        id: customField?.id
     });
     */
  }

  const defaultWhatsapp = await Whatsapp.findOne({
    where: { isDefault: true }
  });

  const { queues } = await ShowWhatsAppService(defaultWhatsapp?.id!);

  if (status === "closed") {   
    await ticket.update({
      status,
      queueId: queues[0].id,
      userId
    });   
  }else{
    await ticket.update({
      status,
      queueId: queues[1].id,
      userId
    });
  }  

  await ticket.reload();

  const io = getIO();

  if (ticket.status !== oldStatus || ticket.user?.id !== oldUserId) {
    io.to(oldStatus).emit("ticket", {
      action: "delete",
      ticketId: ticket.id
    });
  }



  io.to(ticket.status)
    .to("notification")
    .to(ticketId.toString())
    .emit("ticket", {
      action: "update",
      ticket
    });

  return { ticket, oldStatus, oldUserId };
};

export default UpdateTicketService;
