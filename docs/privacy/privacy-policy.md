# JobWarden Privacy Policy

**Last updated:** 2026-07-19
**Applies to:** the JobWarden private beta

JobWarden is a UK-only job-search tool. It is operated as a private beta and is available only to people an administrator has approved.

## What JobWarden stores about you

- **Account:** your email address and sign-in identity, held by Supabase Auth.
- **Career profile:** your CV file, the text extracted from it, the skills, responsibilities, tools, industries, and role history derived from it, and your own corrections and confirmations.
- **Preferences:** your named searches, seniority, locations, work patterns, compensation preferences, exclusions, and notification settings.
- **Activity:** the roles you save, dismiss, or mark as considering; the applications you track and their stage history; your explore choices; and your tailored CV variants, which are stored as a list of edits rather than as extra files.
- **Delivery records:** one row per scheduled digest slot, recording whether an email was sent, suppressed, or failed.

JobWarden does not store your CV text or job description text in logs, error reports, analytics, URLs, or emails.

## What JobWarden does not do

- It does not submit applications on your behalf or contact employers or recruiters.
- It does not sell or share your data with advertisers.
- It does not use your CV to train a model, and it does not send CV content to any provider whose terms permit training on submitted content.
- It runs no browser analytics and sets no non-essential cookies. If that ever changes, an affirmative consent gate becomes mandatory before any such cookie fires, and this document will say so before it happens.

## Legal basis

JobWarden processes your data to provide the service you asked for (contract), and to keep that service secure and working (legitimate interests). Digest emails are sent only after you turn them on, and you can turn them off at any time from your career profile or from the unsubscribe link in any digest.

## Subprocessors

These providers process personal data on JobWarden's behalf. Some are hosted outside the UK; those transfers rely on the UK International Data Transfer Addendum to the EU Standard Contractual Clauses.

| Provider   | Purpose                                             | Personal data involved                      |
| ---------- | --------------------------------------------------- | ------------------------------------------- |
| Supabase   | Database, authentication, private file storage      | Account, career profile, CV files, activity |
| Cloudflare | Application hosting and DNS                         | Request metadata, IP address                |
| Resend     | Digest email delivery                               | Email address, digest contents (job facts)  |
| Sentry     | Optional error reporting, EU region, no default PII | Non-identifying error context               |

No other provider receives personal data. Adding one requires updating this table, and an executable repository check fails the build if a provider appears in the application without appearing here.

## Your rights

You can, at any time:

- **Export** everything JobWarden holds about you, as a JSON file, from your career profile.
- **Delete** your CV, your derived profile, and all associated activity from your career profile. Deletion removes the stored file, the extracted text, your evidence, searches, decisions, applications, explore state, notification settings, and tailored variants.
- **Turn off** digest emails, from your career profile or any digest's unsubscribe link.
- **Object or complain.** You can complain to the UK Information Commissioner's Office.

## Retention

- Your CV is kept until you replace or delete it.
- Unsaved tailored CV variants are deleted automatically 24 hours after they were last saved. Saved variants are kept until you delete them.
- Raw AI proposals expire after 24 hours.
- Delivery records are kept so you can see what was sent; they are erased when you delete your profile data.

## Contact

The owner operating this private beta is the data controller. Contact details are provided to approved users at the point of approval.
