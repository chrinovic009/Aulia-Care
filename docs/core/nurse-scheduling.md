# Planning infirmier — invariants Core

La capacité de suivi n’est plus une constante cachée dans l’API :

1. `ServiceUnit.nursePatientCapacity`, si elle est définie ;
2. sinon `Clinic.defaultNursePatientCapacity` ;
3. sinon le repli sûr système de 5 patients.

Les valeurs non positives sont rejetées par la politique Core et les valeurs anormalement élevées sont plafonnées à 100. Les horaires et timezone sont maintenant configurables au niveau de l’établissement ; l’algorithme existant de rotation doit encore être migré intégralement vers l’interprétation timezone de l’établissement avant de promettre un comportement multi-fuseau certifié.

Une affectation exige une infirmière active, du même établissement, avec un emploi actif compatible avec l’unité et la couverture demandée.
