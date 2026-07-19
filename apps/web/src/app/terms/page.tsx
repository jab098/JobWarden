import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="19 July 2026">
      <p>
        JobWarden is a private beta. Access is granted by an administrator and
        may be withdrawn. It is free to use, with nothing to buy and no paid
        tier.
      </p>

      <h2>What JobWarden is</h2>
      <p>
        JobWarden helps you find, assess, organise, and prepare for UK roles. It
        is not an application service: every application is made by you, on the
        employer&rsquo;s or authorised board&rsquo;s own site.
      </p>

      <h2>What you can rely on</h2>
      <ul>
        <li>
          Job data comes from authorised sources and is presented as those
          sources published it. JobWarden does not claim to contain every UK
          job.
        </li>
        <li>
          Match scores are deterministic and explainable, and are shown with the
          evidence behind them. They are guidance, not a prediction.
        </li>
        <li>
          Pay is labelled as advertised, estimated, or unknown. An estimate is
          never presented as advertised pay.
        </li>
        <li>
          Tailored CV wording must be supported by your existing CV or the
          advert. JobWarden will not write a claim you have not already made.
        </li>
      </ul>

      <h2>What you agree to</h2>
      <ul>
        <li>Use JobWarden for your own job search.</li>
        <li>Provide only your own CV and information.</li>
        <li>
          Not attempt to access another user&rsquo;s data or circumvent access
          controls.
        </li>
      </ul>

      <h2>Availability</h2>
      <p>
        This is a beta running on free service tiers. It may be unavailable, and
        features may change or be withdrawn. Keep your own copies of anything
        you rely on; you can export your data at any time.
      </p>

      <p>
        <Link href="/privacy">Privacy</Link>
      </p>
    </LegalPage>
  );
}
