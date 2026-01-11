module.exports = {
    extends: [
        "eslint:recommended",
        "airbnb-base",
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "prettier",
    ],
    plugins: ["prettier", "@stylistic"],
    parserOptions: {
        project: ["tsconfig.json"],
    },
    rules: {
        "consistent-return": "off",
        "default-case": "off",
        "lines-between-class-members": "off",
        "max-classes-per-file": "off",
        "no-param-reassign": "off",
        "no-plusplus": "off",
        "no-restricted-syntax": [
            "error",
            "ForInStatement",
            "LabeledStatement",
            "WithStatement",
        ],
        "no-shadow": "off",
        "no-use-before-define": "off",

        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/consistent-return": "error",
        "@typescript-eslint/naming-convention": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-unnecessary-condition": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-unused-vars": [
            "error",
            { caughtErrorsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/prefer-nullish-coalescing": "error",
        "@typescript-eslint/prefer-optional-chain": "error",
        "@typescript-eslint/switch-exhaustiveness-check": "error",

        "@stylistic/lines-between-class-members": [
            "error",
            "always",
            { exceptAfterSingleLine: true },
        ],

        "import/extensions": [
            "error",
            "ignorePackages",
            { js: "never", ts: "never" },
        ],
        "import/no-cycle": "error",
        "import/no-extraneous-dependencies": [
            "error",
            { devDependencies: ["vite.config.ts"] },
        ],

        "prettier/prettier": "error",
    },
    settings: {
        "import/resolver": {
            typescript: {
                project: "./tsconfig.json",
            },
        },
    },
};
