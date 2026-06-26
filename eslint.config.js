import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist", "assets/atlas", "assets/audio", "assets/source/raw-sheets/*.svg"]
  },
  {
    languageOptions: {
      globals: {
        AudioContext: "readonly",
        CanvasRenderingContext2D: "readonly",
        HTMLButtonElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLImageElement: "readonly",
        HTMLElement: "readonly",
        Image: "readonly",
        Map: "readonly",
        Promise: "readonly",
        Uint8Array: "readonly",
        Uint16Array: "readonly",
        Float32Array: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        module: "readonly",
        performance: "readonly",
        process: "readonly",
        requestAnimationFrame: "readonly",
        structuredClone: "readonly",
        window: "readonly"
      }
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ]
    }
  }
);
