import { types, transformSync } from "@babel/core";
import nodePath from "path";
import { fileURLToPath } from "url";

import { execSync } from "child_process";

function escapeShellArg(arg) {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function getAbsolutePath(path) {
  let absolutePath = "";

  for (
    let currentPath = path;
    currentPath.key !== "program";
    currentPath = currentPath.parentPath
  ) {
    const isIndex = typeof currentPath.key === "number";

    absolutePath = `${isIndex ? `${currentPath.listKey}.` : ""}${
      currentPath.key
    }${absolutePath ? `.${absolutePath}` : ""}`;
  }

  return absolutePath;
}

function removeCSS(source) {
  const css = [];
  const { code } = transformSync(source, {
    plugins: [
      function removeCSS() {
        return {
          visitor: {
            TaggedTemplateExpression(path) {
              if (path.node.tag.name !== "css") return;

              css.push({
                absolutePath: getAbsolutePath(path),
                code: path.getSource(),
              });
              path.replaceWith(types.stringLiteral("CSS Placeholder"));
              path.skip();
            },
          },
        };
      },
    ],
  });

  return { code, css };
}

function addTailwindCSS({ code: source, css }, tailwindConfig = {}) {
  const { code } = transformSync(source, {
    plugins: [
      function addTailwindCSS() {
        return {
          visitor: {
            Program(path) {
              css.forEach(({ absolutePath, code }) => {
                const currentPath = path.get(absolutePath);

                tailwindConfig.content = [
                  {
                    raw: source,
                  },
                ];

                currentPath.replaceWithSourceString(code);

                currentPath.get("quasi.quasis").forEach(async (quasiPath) => {
                  // Lookup cooked vs raw
                  const value = quasiPath.node.value.cooked;

                  const tailwindScriptPath = nodePath.join(
                    nodePath.dirname(fileURLToPath(import.meta.url)),
                    "scripts/tw.js"
                  );

                  let css;
                  try {
                    css = execSync(
                      `node "${tailwindScriptPath}" ${escapeShellArg(
                        JSON.stringify(tailwindConfig)
                      )} ${escapeShellArg(value)}`
                    ).toString();

                    css = css
                      .replaceAll(/^\s*\n/gm, "")
                      .replaceAll("\\", "\\\\")
                      .replaceAll("`", "\\`");
                    quasiPath.replaceWith(types.templateElement({ raw: css }));
                  } catch (error) {
                    console.log("Some CSS could not be parsed by TailwindCSS");
                  }
                });
              });

              path.skip();
            },
          },
        };
      },
    ],
  });

  return code;
}

export default function tailwindPlugin(tailwindConfig) {
  return {
    name: "tailwind-plugin",
    transform(source, id) {
      if (!id.endsWith(".js") && !id.endsWith(".ts")) return;
      const result = addTailwindCSS(removeCSS(source), tailwindConfig);
      return result;
    },
  };
}
