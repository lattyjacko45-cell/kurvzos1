import { ExternalLinkIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { MessageTime } from "@/components/inbox/message-time";
import {
  formatMessageTimestamp,
  type GmailMessage,
} from "@/lib/gmail/normalize";

interface InboxMessageListProps {
  messages: GmailMessage[];
}

/**
 * Recent inbox messages.
 *
 * Read-only by construction: the only control on a row is an external link to
 * Gmail. There is no compose, reply, archive or delete affordance anywhere in
 * this component, and no route exists that would serve one.
 */
export function InboxMessageList({ messages }: InboxMessageListProps) {
  return (
    <ul className="divide-y">
      {messages.map((message) => (
        <li key={message.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium">
              {/* Unread is a weight and a dot, not a colour — the palette has
                  no unread token and inventing one would overstate it. */}
              {message.isUnread ? (
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block size-1.5 rounded-full bg-primary align-middle"
                />
              ) : null}

              {message.from}

              {message.isUnread ? (
                <span className="sr-only"> (unread)</span>
              ) : null}
            </p>

            <MessageTime
              iso={message.receivedAt}
              serverLabel={formatMessageTimestamp(message.receivedAt)}
            />
          </div>

          <p
            className={`mt-1 truncate text-sm ${
              message.isUnread ? "font-semibold" : ""
            }`}
          >
            {message.subject}
          </p>

          {message.snippet ? (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {message.snippet}
            </p>
          ) : null}

          <p className="mt-3">
            {/* External navigation — a styled anchor, not a Button. */}
            <a
              href={message.gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLinkIcon />
              Open in Gmail
            </a>
          </p>
        </li>
      ))}
    </ul>
  );
}
