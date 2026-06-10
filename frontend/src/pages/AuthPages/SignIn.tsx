import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Connexion | D7 Clinique"
        description="Page de connexion pour D7 Clinique, votre plateforme de gestion de clinique en ligne."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}

