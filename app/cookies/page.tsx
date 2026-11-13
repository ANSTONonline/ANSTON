import LegalPage from "../components/legal-page";
import { pageTitle } from "../components/info-page";
import { cookiePolicy } from "@/lib/legal";

export const generateMetadata = () => pageTitle("cookies");

export default function Page() {
  return <LegalPage doc={cookiePolicy} page="cookies" />;
}
