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
exports.remove = exports.update = exports.show = exports.store = exports.index = void 0;
const socket_1 = require("../libs/socket");
const sequelize_1 = require("sequelize");
const date_fns_1 = require("date-fns");
const CreateTicketService_1 = __importDefault(require("../services/TicketServices/CreateTicketService"));
const DeleteTicketService_1 = __importDefault(require("../services/TicketServices/DeleteTicketService"));
const ListTicketsService_1 = __importDefault(require("../services/TicketServices/ListTicketsService"));
const ShowTicketService_1 = __importDefault(require("../services/TicketServices/ShowTicketService"));
const UpdateTicketService_1 = __importDefault(require("../services/TicketServices/UpdateTicketService"));
const SendWhatsAppMessage_1 = __importDefault(require("../services/WbotServices/SendWhatsAppMessage"));
const ShowWhatsAppService_1 = __importDefault(require("../services/WhatsappService/ShowWhatsAppService"));
const ContactCustomField_1 = __importDefault(require("../models/ContactCustomField"));
const Ticket_1 = __importDefault(require("../models/Ticket"));
const Whatsapp_1 = __importDefault(require("../models/Whatsapp"));
exports.index = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { pageNumber, status, date, searchParam, showAll, queueIds: queueIdsStringified, withUnreadMessages } = req.query;
    /*===================================  INICIO ===================================
        Verifica se existe algum retorno agendado para hoje, caso exista cria uma notificação
      */
    if (showAll == null) {
        var dataHoje = new Date();
        var dataFormatString = dataHoje.toISOString().substr(0, 10).split('-').reverse().join('/');
        var dataFormatMysql = dataHoje.toISOString().slice(0, 10);
        const customField = yield ContactCustomField_1.default.findAll({
            where: { name: "Data de retorno", value: dataFormatString }
        });
        customField.forEach((item) => __awaiter(void 0, void 0, void 0, function* () {
            // Monta o Request
            var body = req.body;
            body.status = "open";
            body.contactId = item.contactId;
            body.userId = req.user.id;
            const { contactId, status, userId } = body;
            // Busca a conexão do Whatsapp padrão
            const defaultWhatsapp = yield Whatsapp_1.default.findOne({
                where: { isDefault: true }
            });
            // Busca as filas cadastradas para o Whatsapp padrão, e define a 3º Fila como Padrão
            const { queues } = yield ShowWhatsAppService_1.default(defaultWhatsapp === null || defaultWhatsapp === void 0 ? void 0 : defaultWhatsapp.id);
            const choosenQueue = queues[2];
            // Só deve permitir criar o ticket para a fila de retorno, caso não existe um ticket criado na data de hoje para o usuario
            const ticket = yield Ticket_1.default.findOne({
                where: { contactId: contactId, status: { [sequelize_1.Op.or]: ["open", "closed"] }, queueId: choosenQueue.id, createdAt: { [sequelize_1.Op.between]: [+date_fns_1.startOfDay(date_fns_1.parseISO(dataFormatMysql)), +date_fns_1.endOfDay(date_fns_1.parseISO(dataFormatMysql))] } }
            });
            // Só deve criar caso não ache um ticket com as condições acima
            if (ticket == null) {
                // Cria o ticket 
                const ticketCriado = yield CreateTicketService_1.default({ contactId, status, userId });
                // Joga o ticket para a fila de retorno
                UpdateTicketService_1.default({
                    ticketData: { queueId: choosenQueue.id },
                    ticketId: ticketCriado.id
                });
            }
        }));
    }
    //====================================  FIM =====================================
    const userId = req.user.id;
    let queueIds = [];
    if (queueIdsStringified) {
        queueIds = JSON.parse(queueIdsStringified);
    }
    const { tickets, count, hasMore } = yield ListTicketsService_1.default({
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
});
exports.store = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { contactId, status, userId } = req.body;
    const ticket = yield CreateTicketService_1.default({ contactId, status, userId });
    const io = socket_1.getIO();
    io.to(ticket.status).emit("ticket", {
        action: "update",
        ticket
    });
    return res.status(200).json(ticket);
});
exports.show = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId } = req.params;
    const contact = yield ShowTicketService_1.default(ticketId);
    return res.status(200).json(contact);
});
exports.update = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId } = req.params;
    const ticketData = req.body;
    const { ticket } = yield UpdateTicketService_1.default({
        ticketData,
        ticketId
    });
    if (ticket.status === "closed") {
        const whatsapp = yield ShowWhatsAppService_1.default(ticket.whatsappId);
        const { farewellMessage } = whatsapp;
        if (farewellMessage) {
            yield SendWhatsAppMessage_1.default({
                body: farewellMessage,
                ticket
            });
        }
    }
    return res.status(200).json(ticket);
});
exports.remove = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { ticketId } = req.params;
    const ticket = yield DeleteTicketService_1.default(ticketId);
    const io = socket_1.getIO();
    io.to(ticket.status)
        .to(ticketId)
        .to("notification")
        .emit("ticket", {
        action: "delete",
        ticketId: +ticketId
    });
    return res.status(200).json({ message: "ticket deleted" });
});
