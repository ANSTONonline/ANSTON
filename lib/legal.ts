// Anston's Privacy Policy and Terms of Service.
// Written in plain English. The English version is the official one; pages
// in other languages show a short note saying so (see i18n dictionaries).
// When anything here changes, update EFFECTIVE_DATE.

export const EFFECTIVE_DATE = "November 13, 2026";
export const CONTACT_EMAIL = "support@myanston.com";

export type LegalSection = { heading: string; paragraphs?: string[]; bullets?: string[]; after?: string[] };
export type LegalDoc = { title: string; intro: string[]; sections: LegalSection[] };

export const privacyPolicy: LegalDoc = {
  title: "Privacy Policy",
  intro: [
    "This Privacy Policy explains what information Anston LLC (\"Anston\", \"we\", \"us\") collects when you use myanston.com (the \"Service\"), how we use it, who we share it with, and the choices you have.",
    "Anston is a marketplace where people buy, bid on, rent, sell and book items and services from each other. We are based in Houston, Texas, USA, and the Service is available worldwide.",
  ],
  sections: [
    {
      heading: "1. Information you give us",
      bullets: [
        "Account details: your email address or phone number, your password (stored only in scrambled, hashed form), your username, and confirmation that you are 18 or older. We use your date of birth only to check your age when you sign up; we do not store it.",
        "If you sign in with Google: your name, email address and profile picture from your Google account. We never see your Google password.",
        "Listings: titles, descriptions, photos, prices, condition, category details (for example allergens for food), and the city, region and country you enter.",
        "Activity on the marketplace: bids, offers, rental and booking requests (including the dates and notes you send), favorites, and reviews.",
        "Messages you send to other users through Anston.",
        "Reports you send us about listings or users, and anything you write to support@myanston.com.",
        "Payment details, once checkout is available: payments will be handled by a payment provider (such as Stripe). We will not store your full card number.",
      ],
    },
    {
      heading: "2. Information collected automatically",
      bullets: [
        "Sign-in cookies that keep you logged in, and a cookie that remembers your language. See our Cookie Policy for the full list.",
        "Your cart and saved listings, which are stored in your own browser, not on our servers.",
        "Basic technical information our hosting providers record to keep the Service running and secure, such as your IP address, browser type and the pages you request.",
      ],
      after: ["We do not use advertising trackers, and we do not sell your information."],
    },
    {
      heading: "3. How we use your information",
      bullets: [
        "To create and run your account and let you log in.",
        "To show your listings, and your username, to other users.",
        "To make bids, offers, rentals, bookings and messages work between buyers and sellers.",
        "To send account emails or texts, such as verification links and codes and password resets.",
        "To keep the marketplace safe: checking ages, reviewing reports, and preventing fraud, spam and prohibited listings.",
        "To answer your questions and improve the Service.",
        "To meet legal obligations.",
      ],
      after: [
        "If you are in the European Economic Area or the UK, our legal bases are: performing our contract with you (running your account and the marketplace), our legitimate interests (safety, fraud prevention and improving the Service), your consent where we ask for it, and legal obligations.",
      ],
    },
    {
      heading: "4. What other users can see",
      paragraphs: [
        "Your username, your listings (including photos and the location you entered), and your ratings are public. People you message, and people who bid on, make offers on, or request your listings (or whose listings you deal with), can see your username and the details of that activity. We do not show your email address or phone number to other users.",
      ],
    },
    {
      heading: "5. Who we share information with",
      paragraphs: ["We share information only with service providers that help us run Anston, and only as needed:"],
      bullets: [
        "Supabase: database, sign-in and photo storage (servers in the United States).",
        "Vercel: website hosting.",
        "Google: only if you choose to sign in with Google.",
        "Email and text message providers that deliver verification messages and support email.",
        "A payment provider such as Stripe, once checkout is available.",
      ],
      after: [
        "We may also share information if the law requires it, to protect the safety of our users or the public, to investigate fraud or violations of our Terms, or as part of a merger or sale of our business (in which case this policy will continue to protect your information).",
      ],
    },
    {
      heading: "6. International transfers",
      paragraphs: [
        "Anston is based in the United States, and our providers store data in the United States. If you use Anston from another country, your information will be transferred to and processed in the United States. Where the law requires it, we rely on safeguards such as standard contractual clauses offered by our providers.",
      ],
    },
    {
      heading: "7. How long we keep information",
      paragraphs: [
        "We keep your account information while your account is open. Listings you delete are removed from the Service. Messages, bids, offers and transaction records may be kept for as long as needed for safety, disputes, and our legal, tax and accounting obligations. When you delete your account, we delete or anonymize your information unless we need to keep it for those reasons.",
      ],
    },
    {
      heading: "8. Your choices and rights",
      paragraphs: [
        "You can update or delete your listings at any time from Your listings. Depending on where you live (including Texas, California, other US states, the EEA and the UK), you may have the right to:",
      ],
      bullets: [
        "Access the personal information we hold about you and get a copy.",
        "Correct information that is wrong.",
        "Delete your information and your account.",
        "Object to or restrict some uses, or withdraw consent you gave.",
        "Not be treated differently for using these rights.",
      ],
      after: [
        "To use any of these rights, email support@myanston.com from the email linked to your account (or tell us your username). We will answer within the time the law requires, usually 30 to 45 days. If we deny your request, you can appeal by replying to our answer. If you are in the EEA or UK, you can also complain to your local data protection authority.",
      ],
    },
    {
      heading: "9. Security",
      paragraphs: [
        "We use encrypted connections (HTTPS), hashed passwords, and database rules that let each person see and change only what belongs to them. No system is perfectly secure, so please use a strong password and keep it to yourself.",
      ],
    },
    {
      heading: "10. Age requirement",
      paragraphs: [
        "Anston is only for people 18 and older. We do not knowingly collect information from anyone under 18. If you believe someone under 18 has an account, email support@myanston.com and we will remove it.",
      ],
    },
    {
      heading: "11. Changes to this policy",
      paragraphs: [
        "If we change this policy, we will update the date at the top. If the changes are significant, we will tell you on the site or by email before they take effect.",
      ],
    },
    {
      heading: "12. Contact us",
      paragraphs: ["Anston LLC, Houston, Texas, USA. Email: support@myanston.com"],
    },
  ],
};

export const termsOfService: LegalDoc = {
  title: "Terms of Service",
  intro: [
    "These Terms of Service (the \"Terms\") are an agreement between you and Anston LLC (\"Anston\", \"we\", \"us\"), a Texas limited liability company. They cover your use of myanston.com (the \"Service\"). By creating an account or using the Service, you agree to these Terms and to our Privacy Policy. If you do not agree, please do not use Anston.",
  ],
  sections: [
    {
      heading: "1. Who can use Anston",
      bullets: [
        "You must be at least 18 years old and able to make a binding contract.",
        "You must give accurate information and keep your account details up to date.",
        "You may have one personal account. You are responsible for everything that happens under your account, so keep your password safe and tell us right away if you think someone else is using it.",
        "You may not use Anston if we have suspended or banned you, or if the law where you live does not allow it.",
      ],
    },
    {
      heading: "2. Anston is a marketplace",
      paragraphs: [
        "Anston provides a place for people to list, find and arrange deals with each other. Unless we clearly say otherwise, we are not the buyer, seller, renter, landlord or service provider, and we are not a party to the deals between users. We do not own, inspect, or guarantee the items and services listed, and we do not employ the people who offer services. Users are responsible for their listings, their deals and their conduct.",
        "Until checkout is available on Anston, buyers and sellers arrange payment and handover between themselves. Please meet in safe, public places, inspect items before paying, and never send money to someone you don't trust.",
      ],
    },
    {
      heading: "3. Listing rules",
      paragraphs: ["When you list something, you promise that:"],
      bullets: [
        "You have the right to sell, rent or offer it, and it is described honestly, with your own photos or photos you are allowed to use.",
        "The price and terms you set are real, and you will honor them.",
        "It follows the law where you and the buyer are, and these Terms.",
        "For services that need a license (for example drivers or private investigators), you hold every license, permit and insurance the law requires where you work.",
        "For homemade food, you follow your local food laws (in Texas, the cottage food rules, including labeling and the items allowed). Homemade food is not inspected by Anston or, in many places, by any health department. Buyers eat it at their own risk, and sellers are fully responsible for its safety, ingredients and allergen information.",
      ],
    },
    {
      heading: "4. Items and services not allowed",
      paragraphs: ["You may not list, buy or arrange any of the following on Anston:"],
      bullets: [
        "Firearms, ammunition, explosives and weapon parts.",
        "Illegal drugs, drug paraphernalia, and prescription medicines.",
        "Alcohol and tobacco or vaping products.",
        "Stolen goods, counterfeits, and anything that infringes someone else's trademark, copyright or other rights.",
        "Adult services or sexual content, and anything involving the exploitation of people.",
        "Live animals (except where we later allow it) and endangered species products.",
        "Recalled, hazardous or unsafe products.",
        "Personal information, accounts, government IDs, or documents.",
        "Gambling, financial schemes, and anything designed to deceive.",
        "Anything else that is illegal where you or the buyer are.",
      ],
      after: ["We may update this list. We may remove any listing or account that we believe breaks these rules, without notice."],
    },
    {
      heading: "5. Buying, bidding, offers, rentals and bookings",
      bullets: [
        "Bids are binding. If you win an auction, you agree to buy at your winning bid. Sellers agree to sell to the winning bidder.",
        "Offers: when a seller accepts your offer, you have both agreed to the deal at that price.",
        "Refunds: every listing shows whether the seller accepts refunds and for how long, or that all sales are final. Sellers must honor the refund policy shown on their listing, and buyers should read it before buying, bidding or booking. Refunds required by law apply either way.",
        "Rentals and bookings: a request becomes an agreement when the seller confirms it. Renters must return items on time and in the same condition, apart from normal wear. Sellers may ask for the security deposit shown on the listing. Any cancellation, damage or late-return terms are between renter and owner and should be agreed in messages before confirming.",
        "If a deal falls through, work it out with the other user first. You can report a user or listing to us, and we may step in to keep the marketplace safe, but we are not required to resolve disputes between users.",
      ],
    },
    {
      heading: "6. Fees",
      paragraphs: [
        "Listing on Anston is currently free and there are no selling fees. If we add fees in the future, we will show them clearly before you list or buy, and they will not apply to deals completed before the change.",
      ],
    },
    {
      heading: "7. Your content",
      paragraphs: [
        "You keep ownership of the listings, photos, messages and reviews you post (\"your content\"). By posting it, you give Anston a worldwide, non-exclusive, royalty-free license to host, store, display, reproduce, translate, and adapt it as needed to run and promote the Service. This license ends when you delete your content, except for copies kept for legal reasons or already shared by other users.",
        "You are responsible for your content. Don't post anything false, misleading, hateful, harassing, or that breaks someone else's rights or the law.",
      ],
    },
    {
      heading: "8. How to behave",
      paragraphs: ["You agree not to:"],
      bullets: [
        "Harass, threaten, scam or discriminate against other users.",
        "Send spam or unwanted messages, or use messages to sell outside of a listing.",
        "Manipulate prices or bids, for example by bidding on your own listings or through other accounts.",
        "Try to get around our safety rules, access other people's accounts or data, or interfere with how the Service works.",
        "Copy or scrape the Service, or use it to build a competing product, without our permission.",
      ],
    },
    {
      heading: "9. Reports, suspensions and closing your account",
      paragraphs: [
        "You can report listings and users from the listing page or by emailing support@myanston.com. We may remove content, limit features, or suspend or close accounts that break these Terms or put others at risk. You may close your account at any time by emailing us. Sections of these Terms that by their nature should continue (such as Your content, Disclaimers, Limitation of liability, Indemnity and Disputes) continue after your account is closed.",
      ],
    },
    {
      heading: "10. Disclaimers",
      paragraphs: [
        "Anston is provided \"as is\" and \"as available\". To the fullest extent the law allows, we make no promises or warranties of any kind, express or implied, including about the accuracy of listings, the quality, safety or legality of items and services, the ability of users to pay or deliver, or that the Service will always be available or error-free. You use the Service and deal with other users at your own risk.",
      ],
    },
    {
      heading: "11. Limitation of liability",
      paragraphs: [
        "To the fullest extent the law allows, Anston and its owners, employees and partners will not be liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, data or goodwill, arising from your use of the Service or any deal with another user. Our total liability for any claim relating to the Service is limited to the greater of the fees you paid us in the 12 months before the claim, or US $100. Some places do not allow these limits, so they may not fully apply to you.",
      ],
    },
    {
      heading: "12. Indemnity",
      paragraphs: [
        "You agree to defend and compensate Anston if a claim is brought against us because of your content, your listings or deals, your breaking of these Terms, or your breaking of the law or someone else's rights.",
      ],
    },
    {
      heading: "13. Disputes and governing law",
      paragraphs: [
        "These Terms are governed by the laws of the State of Texas, USA, without regard to conflict-of-law rules. Before filing a claim against Anston, please email support@myanston.com so we can try to resolve it informally within 30 days. Any claim that is not resolved will be brought only in the state or federal courts located in Harris County, Texas, and you and Anston agree to those courts' jurisdiction. Either of us may instead bring an individual claim in small claims court. If you live in a country whose laws give you the right to bring claims in your local courts, nothing in these Terms takes that right away.",
      ],
    },
    {
      heading: "14. Changes to these Terms",
      paragraphs: [
        "We may update these Terms as Anston grows. We will change the date at the top and, for significant changes, tell you on the site or by email before they take effect. If you keep using Anston after the changes take effect, you accept the new Terms.",
      ],
    },
    {
      heading: "15. Other terms",
      paragraphs: [
        "If any part of these Terms can't be enforced, the rest stays in effect. If we don't enforce a part right away, we can still enforce it later. You may not transfer your rights under these Terms without our permission; we may transfer ours as part of a merger or sale of our business. These Terms and our Privacy Policy are the whole agreement between you and Anston about the Service.",
      ],
    },
    {
      heading: "16. Contact us",
      paragraphs: ["Anston LLC, Houston, Texas, USA. Email: support@myanston.com"],
    },
  ],
};

export const cookiePolicy: LegalDoc = {
  title: "Cookie Policy",
  intro: [
    "Cookies are small files a website stores in your browser. Anston uses only the few cookies needed for the site to work. We do not use advertising or tracking cookies.",
  ],
  sections: [
    {
      heading: "Cookies we use",
      bullets: [
        "NEXT_LOCALE: remembers the language you chose. Kept for one year.",
        "Sign-in cookies (names starting with sb-): keep you logged in securely. Removed when you log out or the session expires.",
      ],
    },
    {
      heading: "Storage in your browser",
      paragraphs: [
        "Your cart and saved listings are stored in your browser's local storage, so they stay on your device and are not sent to us until you act on them.",
      ],
    },
    {
      heading: "Your choices",
      paragraphs: [
        "You can delete or block cookies in your browser settings. If you block sign-in cookies, you won't be able to log in. For more about how we handle information, see our Privacy Policy, or email support@myanston.com.",
      ],
    },
  ],
};
