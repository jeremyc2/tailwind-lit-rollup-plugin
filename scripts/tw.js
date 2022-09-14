import tailwind from "tailwindcss";
import postcss from "postcss";

const args = process.argv.slice(2);

try {
  const config = JSON.parse(args[0]);
  const value = args[1];

  const { css } = await postcss(tailwind(config)).process(value, {
    from: undefined,
  });

  console.log(css);
} catch (error) {
  process.exit(1);
}
