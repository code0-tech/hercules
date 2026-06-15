import {Identifier, Name, Schema} from "@code0-tech/hercules";
import {z} from "zod";

const EmailSchema = z.string().regex(/^[^@]+@[^@]+\.[^@]+$/)
export type EmailType = z.infer<typeof EmailSchema>

@Identifier("email_address")
@Name({code: "en-US", content: "Email Address"})
@Schema(EmailSchema)
export class EmailDataType {}
