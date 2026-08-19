import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignUpForm from "../../components/auth/SignUpForm";

export default function SignUp() {
  return (
    <>
      <PageMeta
        title="Aulia Care | Inscription"
        description="Page d'inscription pour Aulia Care, votre plateforme de gestion de clinique en ligne."
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}

