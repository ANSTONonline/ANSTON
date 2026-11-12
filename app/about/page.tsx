import InfoPage, { pageTitle } from "../components/info-page";

export const generateMetadata = () => pageTitle("about");

export default function Page() {
  return <InfoPage page="about" />;
}
