"use strict";
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
const CheckContactOpenTickets_1 = __importDefault(require("../../helpers/CheckContactOpenTickets"));
const SetTicketMessagesAsRead_1 = __importDefault(require("../../helpers/SetTicketMessagesAsRead"));
const socket_1 = require("../../libs/socket");
const User_1 = __importDefault(require("../../models/User"));
const ShowWhatsAppService_1 = __importDefault(require("../WhatsappService/ShowWhatsAppService"));
const ShowTicketService_1 = __importDefault(require("./ShowTicketService"));
const Whatsapp_1 = __importDefault(require("../../models/Whatsapp"));
const UpdateTicketService = ({ ticketData, ticketId }) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { status, userId, queueId } = ticketData;
    const ticket = yield ShowTicketService_1.default(ticketId);
    yield SetTicketMessagesAsRead_1.default(ticket);
    const oldStatus = ticket.status;
    const oldUserId = (_a = ticket.user) === null || _a === void 0 ? void 0 : _a.id;
    if (oldStatus === "closed") {
        yield CheckContactOpenTickets_1.default(ticket.contact.id);
    }
    if (ticket.status === "open") {
        const user = yield User_1.default.findOne({
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
    const defaultWhatsapp = yield Whatsapp_1.default.findOne({
        where: { isDefault: true }
    });
    const { queues } = yield ShowWhatsAppService_1.default(defaultWhatsapp === null || defaultWhatsapp === void 0 ? void 0 : defaultWhatsapp.id);
    if (status === "closed") {
        yield ticket.update({
            status,
            queueId: queues[0].id,
            userId
        });
    }
    else {
        yield ticket.update({
            status,
            queueId: queues[1].id,
            userId
        });
    }
    yield ticket.reload();
    const io = socket_1.getIO();
    if (ticket.status !== oldStatus || ((_b = ticket.user) === null || _b === void 0 ? void 0 : _b.id) !== oldUserId) {
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
});
exports.default = UpdateTicketService;
