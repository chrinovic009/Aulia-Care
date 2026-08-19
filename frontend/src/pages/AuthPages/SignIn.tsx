import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Aulia Care | Connexion"
        description="Page de connexion pour Aulia Care, votre plateforme de gestion de clinique en ligne."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}

