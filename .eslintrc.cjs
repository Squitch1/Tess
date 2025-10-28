module.exports = {
    extends: [
        "airbnb-base",
        "prettier",
        "eslint:recommended",
        "plugin:import/recommended",
        "plugin:@typescript-eslint/recommended",
        "eslint-config-prettier",
    ],
    plugins: ["prettier"],
    parserOptions: {
        project: ["tsconfig.json"],
    },
    rules: {
        "prettier/prettier": "error",
        "no-plusplus": "off",
        "no-use-before-define": "off",
        "no-shadow": "off",
        "no-param-reassign": "off",
        "lines-between-class-members": [
            "error",
            "always",
            { exceptAfterSingleLine: true },
        ],
        "default-case": "off",
        "max-classes-per-file": "off",
        "import/extensions": [
            "error",
            "ignorePackages",
            {
                js: "never",
                jsx: "never",
                ts: "never",
                tsx: "never",
            },
        ],
        "no-restricted-syntax": [
            "error",
            "ForInStatement",
            "LabeledStatement",
            "WithStatement",
        ],
        "@typescript-eslint/switch-exhaustiveness-check": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-unnecessary-condition": "error",
        "import/no-unresolved": [2, { ignore: [".png$"] }],
    },
    settings: {
        "import/resolver": {
            node: {
                moduleDirectory: ["node_modules", "src/ts", "icons"],
                extensions: [".js", ".jsx", ".ts", ".tsx"],
            },
        },
    },
};
