import { types, transformSync } from "@babel/core";

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

function addTailwindCSS({ code: source, css }) {
  const { code } = transformSync(source, {
    plugins: [
      function addTailwindCSS() {
        return {
          visitor: {
            Program(path) {
              css.forEach(({ absolutePath, code }) => {
                const currentPath = path.get(absolutePath);

                // TODO grab the actual config file
                const config = {
                  content: [
                    {
                      raw: source,
                    },
                  ],
                };

                currentPath.replaceWithSourceString(code);

                currentPath.get("quasi.quasis").forEach(async (quasiPath) => {
                  // Lookup cooked vs raw
                  const value = quasiPath.node.value.raw;

                  try {
                    const css = execSync(
                      `node ./scripts/tw.js ${escapeShellArg(
                        JSON.stringify(config)
                      )} ${escapeShellArg(value)}`
                    ).toString();

                    quasiPath.replaceWith(types.templateElement({ raw: css }));
                  } catch (error) {
                    console.log(
                      "Found some invalid CSS that could not be parsed",
                      value,
                      error
                    );
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

export default function tailwindPlugin() {
  return {
    name: "tailwind-plugin",
    transform(source, id) {
      if (!id.endsWith(".js") && !id.endsWith(".ts")) return;
      const result = addTailwindCSS(removeCSS(source));
      return result;
    },
  };
}
