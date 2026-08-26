import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

const EFFECTIVE_DATE = "August 26, 2026";
const CONTACT_EMAIL = "latoya@kurvzproformance.com";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate={EFFECTIVE_DATE}>
      <LegalSection title="1. Introduction">
        <p>
          This Privacy Policy explains how KurvzOS (&ldquo;KurvzOS,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects,
          uses, and shares information when you use the KurvzOS closed beta
          application (the &ldquo;Service&rdquo;). KurvzOS is currently
          operating as a private, invitation-based closed beta and is not yet
          available as a public commercial product. This policy describes our
          current practices and will be updated as the Service evolves.
        </p>
        <p>
          By using KurvzOS, you agree to the collection and use of
          information as described in this Privacy Policy. If you do not
          agree with this policy, please do not use the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Information You Provide to Us">
        <p>
          We collect information you provide directly when you use KurvzOS,
          including:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-gray-950">
                Account and email information.
              </strong>{" "}
              When you create a KurvzOS account, we collect your name, email
              address, and password (managed securely through our
              authentication provider) to identify you and give you access to
              your account.
            </>,
            <>
              <strong className="text-gray-950">
                Workspace, project, and task information.
              </strong>{" "}
              Information you enter into KurvzOS — such as workspaces,
              projects, tasks, missions, goals, notes, and related content —
              is stored so the Service can function and so you can retrieve
              your work.
            </>,
            <>
              <strong className="text-gray-950">
                Feedback and support communications.
              </strong>{" "}
              If you contact us for support or submit feedback through the
              Service, we collect the content of your message and any
              information you choose to include, so we can respond and
              improve the product.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Information from Connected Services">
        <p>
          KurvzOS can optionally connect to certain third-party services to
          power specific features. As of this policy&rsquo;s effective date,
          KurvzOS may connect to:
        </p>
        <LegalList
          items={["Google Gmail", "Google Calendar", "Google Drive", "YouTube"]}
        />
        <p>
          <strong className="text-gray-950">
            Access is permission-based.
          </strong>{" "}
          KurvzOS does not access any of these services unless and until you
          affirmatively choose to connect that specific account through
          KurvzOS&rsquo;s authorization flow. You may connect any, all, or
          none of these services, and each connection is granted separately.
        </p>
        <p>
          Here is how each connected service is currently used within
          KurvzOS:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-gray-950">Gmail.</strong> Once
              connected, KurvzOS reads relevant inbox information — such as
              senders, subject lines, and short message previews — to display
              it inside KurvzOS (for example, in your inbox view or Morning
              Brief).
            </>,
            <>
              <strong className="text-gray-950">Google Calendar.</strong>{" "}
              Once connected, KurvzOS reads schedule information — such as
              event titles and times — to display your schedule inside
              KurvzOS and help surface relevant context, such as upcoming
              events or potential scheduling conflicts.
            </>,
            <>
              <strong className="text-gray-950">Google Drive.</strong> Once
              connected, KurvzOS reads file information available through
              your connected account — such as file names, types, and
              modification dates — so you can view and search for your files
              inside KurvzOS.
            </>,
            <>
              <strong className="text-gray-950">YouTube.</strong> Once
              connected, KurvzOS uses your authorized YouTube connection to
              support the content workflow features you choose to use, which
              may include retrieving channel or video information, uploading
              content, managing authorized video-related workflow actions,
              and checking publishing or processing status.
            </>,
          ]}
        />
        <p>
          We request and use access only for the KurvzOS features associated
          with each connected service and aim to use the minimum permissions
          reasonably necessary for those features.
        </p>
      </LegalSection>

      <LegalSection title="4. Google API Services User Data">
        <p>
          This section applies specifically to information KurvzOS receives
          through Google APIs (Gmail, Google Calendar, Google Drive, and
          YouTube).
        </p>
        <p>
          KurvzOS&rsquo;s use and transfer of information received from
          Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-gray-950 underline underline-offset-2"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>Specifically:</p>
        <LegalList
          items={[
            "Google user data is used only to provide or improve user-facing KurvzOS features directly associated with the connected Google service (for example, displaying your inbox, calendar, Drive files, or YouTube content workflow inside KurvzOS).",
            "KurvzOS does not sell Google user data.",
            "KurvzOS does not use Google user data, including Google Workspace data, for advertising purposes.",
            "Human access to Google user data is restricted. We do not allow personnel to read your Google user data except: (a) with your consent, for support you have requested; (b) to investigate security incidents, abuse, or violations of our Terms of Use; (c) to comply with applicable law, regulation, legal process, or enforceable governmental request; or (d) in other circumstances permitted by Google's applicable policies.",
            <>
              <strong className="text-gray-950">Disconnecting.</strong> You
              may disconnect any Google integration (Gmail, Calendar, Drive,
              or YouTube) from KurvzOS at any time, generally from your
              account or connected-services settings within the app.
              Disconnecting stops KurvzOS from accessing that service going
              forward.
            </>,
            <>
              <strong className="text-gray-950">
                Deleting stored data.
              </strong>{" "}
              You may request deletion of KurvzOS data associated with your
              account, including data obtained through connected Google
              services, by contacting us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-gray-950 underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              . We will act on verified deletion requests in accordance with
              this Policy.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="5. AI-Assisted Features">
        <p>
          KurvzOS includes AI-assisted executive and advisory features (for
          example, the Executive Team and Morning Brief features) that
          generate recommendations, summaries, and guidance based on your
          workspace and context data.
        </p>
        <p>
          When you use these features, relevant workspace and context data
          may be processed by an AI service provider in order to generate
          the specific recommendation or summary you requested. This
          processing happens on a per-request basis to produce the output
          you asked for.
        </p>
        <p>
          KurvzOS does not use, or permit the use of, Google API user data to
          train or develop generalized or non-personalized AI or
          machine-learning models. Google API user data may be processed
          only as necessary to provide user-facing KurvzOS features
          permitted by applicable Google policies.
        </p>
        <p>
          We do not make claims about whether any AI service provider
          retains or does not retain data beyond what is disclosed in that
          provider&rsquo;s own applicable terms, as this may vary by provider
          and may change over time.
        </p>
      </LegalSection>

      <LegalSection title="6. Service Providers">
        <p>
          We work with service providers that help us operate KurvzOS.
          Depending on the feature, these providers fall into categories
          such as:
        </p>
        <LegalList
          items={[
            "Hosting and infrastructure providers",
            "Database and authentication providers",
            "AI service providers (used to power AI-assisted features)",
            "Google APIs (used to power connected-service features, as described above)",
            "Other vendors reasonably necessary to operate and support KurvzOS",
          ]}
        />
        <p>
          These providers process information on our behalf and only as
          needed to provide the Service.
        </p>
      </LegalSection>

      <LegalSection title="7. How We Use Information">
        <p>We use the information we collect to:</p>
        <LegalList
          items={[
            "Operate, maintain, and provide the features of KurvzOS",
            "Authenticate your account and secure the Service",
            "Generate the AI-assisted recommendations, summaries, and features you request",
            "Respond to support requests and feedback",
            "Diagnose problems and improve the reliability and functionality of KurvzOS",
            "Communicate with you about your account or the Service",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Data Sharing">
        <p>
          We do not sell your personal information. We share information
          only:
        </p>
        <LegalList
          items={[
            "With service providers described above, as necessary to operate the Service",
            "When required by law, legal process, or governmental request",
            "To protect the rights, property, or safety of KurvzOS, our users, or others",
            "With your consent, or at your direction",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Data Retention">
        <p>
          We retain your account and workspace information for as long as
          your account remains active or as needed to provide the Service to
          you. If you request deletion of your account or data, we will
          delete or de-identify it within a reasonable period, except where
          retention is required to comply with legal obligations, resolve
          disputes, or enforce our agreements.
        </p>
      </LegalSection>

      <LegalSection title="10. Security">
        <p>
          We use reasonable administrative and technical safeguards designed
          to protect your information, including secure authentication and
          encrypted storage of sensitive credentials such as
          connected-service tokens. However, no method of transmission or
          storage is completely secure, and we cannot guarantee absolute
          security.
        </p>
      </LegalSection>

      <LegalSection title="11. Your Choices and Access/Deletion Requests">
        <p>You can:</p>
        <LegalList
          items={[
            "Update certain account information directly within KurvzOS",
            "Disconnect any connected Google service at any time",
            <>
              Request access to, or deletion of, your KurvzOS account and
              associated data by contacting{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-gray-950 underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
            </>,
          ]}
        />
        <p>We will respond to verified requests within a reasonable time.</p>
      </LegalSection>

      <LegalSection title="12. Cookies, Sessions, and Authentication Technologies">
        <p>
          KurvzOS uses cookies and similar technologies solely to maintain
          your signed-in session and support core authentication and
          security functionality. We do not currently use cookies for
          third-party advertising or cross-site tracking.
        </p>
      </LegalSection>

      <LegalSection title="13. Children's Privacy">
        <p>
          KurvzOS is not intended for, and is not directed at, children under
          the age of 13. We do not knowingly collect personal information
          from children under 13. If you believe a child has provided us
          with personal information, please contact us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium text-gray-950 underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          so we can address it.
        </p>
      </LegalSection>

      <LegalSection title="14. Processing of Information">
        <p>
          KurvzOS and its service providers may process information in the
          United States or other locations where they maintain facilities or
          operations. Where information is processed outside your location,
          it may be subject to the laws of that jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="15. Changes to This Policy">
        <p>
          Because KurvzOS is in active closed-beta development, this Privacy
          Policy may be updated as features change. We will update the
          effective date above when changes are made. Material changes will
          be communicated to closed-beta participants where reasonably
          practical.
        </p>
      </LegalSection>

      <LegalSection title="16. Contact">
        <p>
          If you have questions about this Privacy Policy or wish to
          exercise any of the choices described above, contact us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium text-gray-950 underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          See also our{" "}
          <Link
            href="/terms"
            className="font-medium text-gray-950 underline underline-offset-2"
          >
            Terms of Use
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
