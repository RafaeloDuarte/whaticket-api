import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  email?: string;
  profilePicUrl?: string;
  sex?: string;
  target?: string;
  zipCode?: string;
  availability?: string;
  insurance?: string;
  caseDescription?: string;
  typeTreatment?: string;
  stage?: string;
  answered?: string;
  extraInfo?: ExtraInfo[];
}

const CreateContactService = async ({
  name,
  number,
  email = "",
  sex,
  target,
  zipCode,
  availability,
  insurance,
  caseDescription,
  typeTreatment,
  stage,
  answered,
  extraInfo = []
}: Request): Promise<Contact> => {
  const numberExists = await Contact.findOne({
    where: { number }
  });

  if (numberExists) {
    throw new AppError("ERR_DUPLICATED_CONTACT");
  }

  const contact = await Contact.create(
    {
      name,
      number,
      email,
      sex,
      target,
      zipCode,
      availability,
      insurance,
      caseDescription,
      typeTreatment,
      stage,
      answered,
      extraInfo
    },
    {
      include: ["extraInfo"]
    }
  );

  return contact;
};

export default CreateContactService;
