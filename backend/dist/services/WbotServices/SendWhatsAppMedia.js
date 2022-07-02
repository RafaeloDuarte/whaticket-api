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
const fs_1 = __importDefault(require("fs"));
const whatsapp_web_js_1 = require("whatsapp-web.js");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const GetTicketWbot_1 = __importDefault(require("../../helpers/GetTicketWbot"));
const SendWhatsAppMedia = ({ media, ticket }) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const wbot = yield GetTicketWbot_1.default(ticket);
        const newMedia = whatsapp_web_js_1.MessageMedia.fromFilePath(media.path);
        const sentMessage = yield wbot.sendMessage(`${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`, newMedia, { sendAudioAsVoice: true });
        yield ticket.update({ lastMessage: media.filename });
        fs_1.default.unlinkSync(media.path);
        return sentMessage;
    }
    catch (err) {
        throw new AppError_1.default("ERR_SENDING_WAPP_MSG");
    }
});
exports.default = SendWhatsAppMedia;
