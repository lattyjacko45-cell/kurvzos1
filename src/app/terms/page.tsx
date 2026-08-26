import type { Metadata } from "next";
import Link from "next/link";

import { LegalList, LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use",
};

const EFFECTIVE_DATE = "August 26, 2026";
const CONTACT_EMAIL = "latoya@kurvzproformance.com";

export default function TermsOfUsePage() {
  return (
    <LegalPage title="Terms of Use" effectiveDate={EFFECTIVE_DATE}>
      <LegalSection title="1. Acceptance of Terms">
        <p>
          These Terms of Use (&ldquo;Terms&rdquo;) govern your access to and
          use of the KurvzOS closed beta application (the
          &ldquo;Service&rdquo;). By creating an account, accessing, or using
          KurvzOS, you agree to be bound by these Terms. If you do not
          agree, do not use the Service.
        </p>
      </LegalSection>

      <LegalSection title="2. Closed Beta Status">
        <p>KurvzOS is currently offered as a closed beta. This means:</p>
        <LegalList
          items={[
            "The product is still being actively tested and developed.",
            "Features, functionality, and behavior may change, be added, or be removed at any time, without notice.",
            "Availability of the Service, or any specific feature, is not guaranteed.",
            "Participation in the closed beta may be limited, paused, or revoked at any time, at our discretion.",
          ]}
        />
        <p>
          The Service is provided on this basis so that we can test, refine,
          and improve KurvzOS before any broader release.
        </p>
      </LegalSection>

      <LegalSection title="3. Eligibility">
        <p>
          To participate in the KurvzOS closed beta, you must be at least 18
          years old, unless we later establish and clearly communicate
          another approved process for different eligibility criteria. By
          using the Service, you represent that you meet this requirement.
        </p>
      </LegalSection>

      <LegalSection title="4. Account Responsibilities">
        <p>You are responsible for:</p>
        <LegalList
          items={[
            "Providing accurate account information and keeping it up to date",
            "Maintaining the confidentiality of your login credentials and not sharing your account with others",
            "All activity that occurs under your account",
            "Using any connected third-party accounts (such as Google services) responsibly and in accordance with their own terms",
          ]}
        />
        <p>
          Notify us promptly at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium text-gray-950 underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          if you believe your account has been compromised.
        </p>
      </LegalSection>

      <LegalSection title="5. Acceptable Use">
        <p>You agree not to use KurvzOS to:</p>
        <LegalList
          items={[
            "Engage in any unlawful activity or violate any applicable law or regulation",
            "Abuse, harass, or harm KurvzOS, its users, or any third party",
            "Attempt to gain unauthorized access to any account, system, or data",
            "Disrupt, overload, or interfere with the operation of the Service",
            "Reverse engineer, decompile, or disassemble the Service, except to the extent such restriction is prohibited by applicable law",
            "Engage in malicious activity, including introducing malware or attempting to compromise the security of the Service",
            "Scrape, systematically extract data from, or launch automated attacks against the Service",
            "Impersonate any person or entity, or misrepresent your affiliation with any person or entity",
            "Use the Service in a way that violates the intellectual property, privacy, or other rights of any third party",
          ]}
        />
        <p>We may suspend or terminate access for anyone who violates this section.</p>
      </LegalSection>

      <LegalSection title="6. Connected Third-Party Services">
        <p>
          KurvzOS allows you to optionally connect third-party services,
          including Google services (Gmail, Google Calendar, Google Drive)
          and YouTube. Your use of those services is governed by their own
          terms of service and privacy policies, not by these Terms. Those
          services may change, be limited, or become unavailable at any time
          for reasons outside our control, and we are not responsible for
          the availability or behavior of third-party services.
        </p>
      </LegalSection>

      <LegalSection title="7. AI-Assisted Output">
        <p>
          KurvzOS includes AI-assisted features that generate
          recommendations, summaries, and other output based on your
          workspace data. You acknowledge and agree that:
        </p>
        <LegalList
          items={[
            "AI-generated recommendations and summaries may be incomplete, inaccurate, or unsuitable for your specific situation.",
            "You remain solely responsible for any decisions or actions you take based on AI-assisted output.",
            "AI-assisted output is provided for informational purposes only and does not constitute professional legal, medical, tax, financial, or other regulated advice. You should consult a qualified professional before relying on it for any such purpose.",
          ]}
        />
      </LegalSection>

      <LegalSection title="8. User Content and Workspace Data">
        <p>
          You retain ownership of the content you submit to KurvzOS,
          including your workspace, project, task, and other data
          (&ldquo;User Content&rdquo;). By using the Service, you grant
          KurvzOS a limited, non-exclusive license to host, store, process,
          and display your User Content solely as necessary to operate and
          provide the Service to you. This license does not transfer
          ownership of your User Content and ends when your content is
          removed from the Service, except as needed to comply with legal
          obligations or as described in our Privacy Policy.
        </p>
      </LegalSection>

      <LegalSection title="9. KurvzOS Intellectual Property">
        <p>
          Except for User Content, we and our licensors retain all rights,
          title, and interest in and to KurvzOS, including its software,
          design, branding, and features. Nothing in these Terms grants you
          any right to use KurvzOS branding or intellectual property except
          as necessary to use the Service as intended.
        </p>
      </LegalSection>

      <LegalSection title="10. Feedback">
        <p>
          If you voluntarily submit feedback, suggestions, or ideas about
          KurvzOS, you agree that we may use that feedback to maintain,
          improve, and develop the product without any obligation to you,
          and without transferring ownership of your underlying User
          Content. Submitting feedback does not give KurvzOS any rights to
          your User Content beyond what is described in Section 8.
        </p>
      </LegalSection>

      <LegalSection title="11. Privacy">
        <p>
          Our collection and use of information in connection with the
          Service is described in our{" "}
          <Link
            href="/privacy"
            className="font-medium text-gray-950 underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          , which is incorporated into these Terms by reference.
        </p>
      </LegalSection>

      <LegalSection title="12. Beta Availability, Modification, and Suspension">
        <p>
          Because KurvzOS is a closed beta, we may modify, suspend, or
          discontinue the Service, or any part of it, at any time, with or
          without notice. We may also modify these Terms as the product
          evolves, as described below.
        </p>
      </LegalSection>

      <LegalSection title="13. Disclaimers">
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
          IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED
          WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          AND NON-INFRINGEMENT. AS A CLOSED BETA PRODUCT, KURVZOS MAY CONTAIN
          BUGS, ERRORS, OR INTERRUPTIONS, AND WE DO NOT WARRANT THAT THE
          SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
        </p>
      </LegalSection>

      <LegalSection title="14. Limitation of Liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, KURVZOS AND ITS
          OPERATORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF
          DATA, PROFITS, REVENUE, OR GOODWILL, ARISING OUT OF OR RELATED TO
          YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
          DAMAGES. BECAUSE THE CLOSED BETA IS PROVIDED FREE OF CHARGE,
          KURVZOS&rsquo;S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO
          THESE TERMS OR THE SERVICE IS LIMITED TO THE FULLEST EXTENT
          PERMITTED BY APPLICABLE LAW.
        </p>
      </LegalSection>

      <LegalSection title="15. Indemnification">
        <p>
          You agree to indemnify and hold KurvzOS harmless from claims,
          damages, or expenses (including reasonable attorneys&rsquo; fees)
          arising directly from your violation of these Terms or your
          misuse of the Service, except to the extent caused by
          KurvzOS&rsquo;s own actions.
        </p>
      </LegalSection>

      <LegalSection title="16. Termination">
        <p>
          We may suspend or terminate your access to the Service at any
          time, for any reason, including if we reasonably believe you have
          violated these Terms. You may stop using the Service at any time.
          Sections of these Terms that by their nature should survive
          termination (including Sections 8 through 10 and 13 through 16)
          will survive.
        </p>
      </LegalSection>

      <LegalSection title="17. Governing Law">
        <p>
          These Terms are governed by the laws of the State of Florida,
          without regard to conflict-of-law principles.
        </p>
      </LegalSection>

      <LegalSection title="18. Changes to These Terms">
        <p>
          We may update these Terms from time to time as KurvzOS evolves
          during the closed beta. We will update the effective date above
          when changes are made. Continued use of the Service after changes
          take effect constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection title="19. Contact">
        <p>
          If you have questions about these Terms, contact us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-medium text-gray-950 underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
