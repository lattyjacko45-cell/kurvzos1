/**
 * Branch tests for Harper Morning Brief email classification.
 *
 * Run with:  npm test
 *
 * This is the deterministic fallback path — the one the page relies on when
 * no AI provider is configured, so every required scenario from the Morning
 * Brief spec is covered here directly rather than only through the AI path.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyEmailDeterministic,
  groupClassifiedEmails,
  selectActionTodayItems,
  buildInboxSnapshot,
} from "./classify.ts";

function email(over = {}) {
  return {
    from: "Sender <sender@example.com>",
    subject: "Subject line",
    snippet: "A short preview.",
    isUnread: true,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Required scenarios
// ---------------------------------------------------------------------------

test("failed payment classifies as Money + Accounts, Action Today", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "Notion <billing@notion.so>",
      subject: "Payment failure for Notion",
      snippet: "We were unable to process your payment.",
    })
  );

  assert.equal(result.category, "MONEY_AND_ACCOUNTS");
  assert.equal(result.isActionToday, true);
});

// ---------------------------------------------------------------------------
// Payment-failure phrasing variants (regression: these used to slip past
// the narrower "payment failed/declined/..." pattern and land in Can Wait)
// ---------------------------------------------------------------------------

test("'payment was unsuccessful' with a merchant name in between classifies as Money + Accounts, Action Today", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "VEED LIMITED <billing@veed.io>",
      subject: "Payment unsuccessful",
      snippet: "$45.00 payment to VEED LIMITED was unsuccessful again.",
    })
  );

  assert.equal(result.category, "MONEY_AND_ACCOUNTS");
  assert.equal(result.isActionToday, true);
});

test("'payment didn't work' classifies as Money + Accounts, Action Today", () => {
  const result = classifyEmailDeterministic(
    email({
      subject: "There was a problem with your payment",
      snippet: "Your payment didn't work — please update your payment method.",
    })
  );

  assert.equal(result.category, "MONEY_AND_ACCOUNTS");
  assert.equal(result.isActionToday, true);
});

test("'card was declined' classifies as Money + Accounts, Action Today", () => {
  const result = classifyEmailDeterministic(
    email({
      subject: "Your card was declined",
      snippet: "We were unable to charge your card on file.",
    })
  );

  assert.equal(result.category, "MONEY_AND_ACCOUNTS");
  assert.equal(result.isActionToday, true);
});

test("'failed renewal' classifies as Money + Accounts, Action Today", () => {
  const result = classifyEmailDeterministic(
    email({
      subject: "Your subscription renewal failed",
      snippet: "We tried to renew your plan, but the failed renewal means your access may be interrupted.",
    })
  );

  assert.equal(result.category, "MONEY_AND_ACCOUNTS");
  assert.equal(result.isActionToday, true);
});

test("a successful payment confirmation stays routine, not urgent (no false positive from the broader patterns)", () => {
  const result = classifyEmailDeterministic(
    email({
      subject: "Payment received",
      snippet: "Your payment of $45.00 was successful. Thank you for your business.",
    })
  );

  assert.equal(result.category, "MONEY_AND_ACCOUNTS");
  assert.equal(result.isActionToday, false);
});

test("security alert classifies as Action Today", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "Google <no-reply@accounts.google.com>",
      subject: "Security alert",
      snippet: "We noticed a new sign-in to your Google Account.",
    })
  );

  assert.equal(result.isActionToday, true);
  assert.equal(result.category, "MONEY_AND_ACCOUNTS");
});

test("promotional comeback email classifies as Potential Junk", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "YouTube TV <no-reply@youtube.com>",
      subject: "Come back and save on YouTube TV",
      snippet: "We miss you — enjoy 50% off your next 3 months.",
    })
  );

  assert.equal(result.category, "POTENTIAL_JUNK");
  assert.equal(result.isActionToday, false);
});

test("job alert classifies as Career and Opportunities", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "LinkedIn Job Alerts <jobs-noreply@linkedin.com>",
      subject: "New job alert: Airport Customer Operations",
      snippet: "American Airlines is hiring for a role that matches your profile.",
    })
  );

  assert.equal(result.category, "CAREER_AND_OPPORTUNITIES");
});

test("dash-separated job-title subject from a jobs sender reads as Career", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "Indeed <alert@indeed.com>",
      subject: "American Airlines — Airport Customer Operations",
      snippet: "A new job matching your search was just posted.",
    })
  );

  assert.equal(result.category, "CAREER_AND_OPPORTUNITIES");
});

test("ordinary newsletter classifies as Can Wait or Unsubscribe Candidate", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "The Daily Digest <hello@dailydigest.example.com>",
      subject: "Your weekly newsletter: 5 things to know",
      snippet: "Here is this week's roundup of top stories.",
    })
  );

  assert.ok(
    result.category === "CAN_WAIT" || result.category === "UNSUBSCRIBE_CANDIDATE",
    `expected Can Wait or Unsubscribe Candidate, got ${result.category}`
  );
});

test("a message with no strong signal defaults to Can Wait, not Junk", () => {
  const result = classifyEmailDeterministic(
    email({
      from: "Jordan <jordan@example.com>",
      subject: "Quick question about next week",
      snippet: "Hey, wanted to check if you're free to chat sometime.",
    })
  );

  assert.equal(result.category, "CAN_WAIT");
});

// ---------------------------------------------------------------------------
// Money + Accounts vs Action Today badge — no duplicate rows
// ---------------------------------------------------------------------------

test("an urgent Money item appears once, under Money + Accounts, badge-flagged", () => {
  const classified = {
    ...email(),
    ...classifyEmailDeterministic(
      email({
        subject: "Payment failure for Notion",
        snippet: "We could not process your payment.",
      })
    ),
  };

  const sections = groupClassifiedEmails([classified]);

  assert.equal(sections.moneyAndAccounts.length, 1);
  assert.equal(sections.kurvzProformance.length, 0);
  assert.equal(sections.careerAndOpportunities.length, 0);
  assert.equal(sections.canWait.length, 0);
  assert.equal(sections.potentialJunk.length, 0);
  assert.equal(sections.unsubscribeCandidates.length, 0);

  const actionToday = selectActionTodayItems(sections);
  assert.equal(actionToday.length, 1);
  assert.equal(actionToday[0], classified, "the rollup must reference the same item, not a copy");
});

test("Potential Junk and Unsubscribe Candidate stay distinct buckets", () => {
  const promo = classifyEmailDeterministic(
    email({
      subject: "Flash sale — 40% off ends tonight",
      snippet: "Don't miss out on exclusive savings.",
    })
  );

  const newsletter = classifyEmailDeterministic(
    email({
      subject: "This week in design: our newsletter",
      snippet: "A digest of the best reads from this week.",
    })
  );

  assert.equal(promo.category, "POTENTIAL_JUNK");
  assert.equal(newsletter.category, "UNSUBSCRIBE_CANDIDATE");
  assert.notEqual(promo.category, newsletter.category);
});

// ---------------------------------------------------------------------------
// Empty inbox
// ---------------------------------------------------------------------------

test("no Gmail messages produces empty sections and a zeroed snapshot", () => {
  const sections = groupClassifiedEmails([]);
  const snapshot = buildInboxSnapshot(sections);

  for (const key of Object.keys(sections)) {
    assert.equal(sections[key].length, 0, `${key} should be empty`);
  }

  assert.deepEqual(snapshot, {
    actionTodayCount: 0,
    moneyCount: 0,
    businessCount: 0,
    careerCount: 0,
    canWaitCount: 0,
    junkCount: 0,
    unsubscribeCount: 0,
  });
});

// ---------------------------------------------------------------------------
// Snapshot counts agree with section membership
// ---------------------------------------------------------------------------

test("snapshot counts equal the length of each rendered section", () => {
  const items = [
    { subject: "Payment failure for Notion", snippet: "unable to process" },
    { subject: "Come back and save 30%", snippet: "we miss you" },
    { subject: "New job alert for you", snippet: "matches your profile" },
    { subject: "Let's collaborate on a project", snippet: "business inquiry" },
    { subject: "Your weekly newsletter", snippet: "digest of top stories" },
    { subject: "Quick hello", snippet: "just checking in" },
  ].map((over) => {
    const base = email(over);
    return { ...base, ...classifyEmailDeterministic(base) };
  });

  const sections = groupClassifiedEmails(items);
  const snapshot = buildInboxSnapshot(sections);

  assert.equal(snapshot.moneyCount, sections.moneyAndAccounts.length);
  assert.equal(snapshot.businessCount, sections.kurvzProformance.length);
  assert.equal(snapshot.careerCount, sections.careerAndOpportunities.length);
  assert.equal(snapshot.canWaitCount, sections.canWait.length);
  assert.equal(snapshot.junkCount, sections.potentialJunk.length);
  assert.equal(snapshot.unsubscribeCount, sections.unsubscribeCandidates.length);

  const totalClassified =
    sections.moneyAndAccounts.length +
    sections.kurvzProformance.length +
    sections.careerAndOpportunities.length +
    sections.canWait.length +
    sections.potentialJunk.length +
    sections.unsubscribeCandidates.length;

  assert.equal(totalClassified, items.length, "every item lands in exactly one section");
});
