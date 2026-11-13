import LegalPage from "../components/legal-page";
import { pageTitle } from "../components/info-page";
import { privacyPolicy } from "@/lib/legal";

export const generateMetadata = () => pageTitle("privacy");

export default function Page() {
  return <LegalPage doc={privacyPolicy} page="privacy" />;
}
