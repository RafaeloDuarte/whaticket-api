import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  isGroup: boolean;
  email?: string;
  profilePicUrl?: string;
  extraInfo?: ExtraInfo[];
}

var extraInfoInitialValue = [
  {
    name: 'Atendente',
    value: ''
  },
  {
    name: 'Data de retorno',
    value: ''
  },
  {
    name: 'Obsevação',
    value: ''
  }
];

const CreateOrUpdateContactService = async ({
  name,
  number: rawNumber,
  profilePicUrl,
  isGroup,
  email = "",
  extraInfo = extraInfoInitialValue
}: Request): Promise<Contact> => {
  const number = isGroup ? rawNumber : rawNumber.replace(/[^0-9]/g, "");

  const io = getIO();
  let contact: Contact | null;
  let customField: ContactCustomField | null;

  contact = await Contact.findOne({ where: { number } });

  if (contact) {
    contact.update({ profilePicUrl });

    io.emit("contact", {
      action: "update",
      contact
    });
  } else {
    contact = await Contact.create({
      name,
      number,
      profilePicUrl,
      email,
      isGroup,
      extraInfo
    });

    io.emit("contact", {
      action: "create",
      contact
    });

    var idContact = contact.id;

    extraInfoInitialValue.forEach(async (element) => {        
      customField = await ContactCustomField.create({
        name: element.name,
        value: element.value,
        contactId: idContact
      });
    });
    
  }

  return contact;
};

export default CreateOrUpdateContactService;
