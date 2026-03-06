import { sendTemplateEmail } from "./sendTemplateEmail";

type SendShareLinkEmailOpts = {
  to: string;
  from: string;
  subject: string;
  template: {
    id: string;
    variables: Record<string, string>;
  };
};

export { sendTemplateEmail as sendShareLinkEmail };
export type { SendShareLinkEmailOpts };
