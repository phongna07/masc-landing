import TicketTemplateEditor from "./ticket-template-editor";
import { ticketMessages } from "@/lib/ticket-messages";

export default function TicketTemplatesPage() { return <TicketTemplateEditor baseCopies={ticketMessages} />; }
