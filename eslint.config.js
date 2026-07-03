import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // 1. BLOCAGE STRICT DES DOSSIERS DE BUILD ET FICHIERS MINIFIÉS
  { 
    ignores: [
      '**/dist/**', 
      '**/dist-frontend/**', // Empêche l'analyse des assets, sw.js et workbox
      '**/dist-backend/**',
      '**/node_modules/**',
      '**/*.min.js',
      '**/sw.js'
    ] 
  },
  
  // 2. Chargement des configs de base
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 3. Configuration de ton code source
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // --- SÉCURITÉS ET ASSOUPLISSEMENTS ---
      
      // Désactive les erreurs sur les expressions non utilisées (très fréquent en JS minifié ou chaînages courts)
      '@typescript-eslint/no-unused-expressions': 'off',

      // Transforme l'erreur 'any' en simple avertissement
      '@typescript-eslint/no-explicit-any': 'warn', 

      // Permet les blocs vides (ex: catch(e) {})
      'no-empty': 'warn', 

      // Variables inutilisées tolérées en avertissements (ignore si commence par _)
      '@typescript-eslint/no-unused-vars': ['warn', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_' 
      }],

      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)