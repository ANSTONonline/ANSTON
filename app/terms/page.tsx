import LegalPage from "../components/legal-page";
import { pageTitle } from "../components/info-page";
import { termsOfService } from "@/lib/legal";

export const generateMetadata = () => pageTitle("terms");

export default function Page() {
  return <LegalPage doc={termsOfService} page="terms" />;
}
