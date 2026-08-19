import { HelmetProvider, Helmet } from "react-helmet-async";

const PageMeta = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <Helmet>
    <title>{title.replace(/Aulia Care\s*(Clinique|Clinic)?/gi, "Aulia Care")}</title>
    <meta name="description" content={description.replace(/Aulia Care\s*(Clinique|Clinic)?/gi, "Aulia Care")} />
  </Helmet>
);

export const AppWrapper = ({ children }: { children: React.ReactNode }) => (
  <HelmetProvider>{children}</HelmetProvider>
);

export default PageMeta;
