#!/usr/bin/env node
// @ts-check

const { execSync } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const prompts = require("prompts");
const validateName = require("validate-npm-package-name");

/**
 * @typedef {() => void} StepAction
 */

/**
 * @typedef {Object} Package
 * @property {string} name
 * @property {string} version
 * @property {string} description
 * @property {Record<string, string>} [scripts]
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [devDependencies]
 */

/**
 * @typedef {Object} Step
 * @property {string} message
 * @property {StepAction} action
 * @property {boolean} ignoreDry
 */

/**
 * @function
 * @param {string} token
 * @returns {string | null} applicationId
 */
const getApplicationId = (token) => {
  try {
    /** @type {string} */
    const response = execSync(
      `curl -s -X GET -H "Authorization: Bot ${token}" "https://discord.com/api/oauth2/applications/@me"`
    ).toString();
    const parsedResponse = JSON.parse(response);

    return parsedResponse.id || null;
  } catch {
    return null;
  }
};
/** @type {string} */
const appDir = path.join(__dirname, "../app");
/** @type {Package} */
const appPackage = require(path.join(appDir, "package.json"));
/** @type {Package} */
const { name, version } = require(path.join(__dirname, "../package.json"));
const utilityNameAndVersion = `${name} v${version}`;

console.log(`This utility will walk you through creating a ${name} application.

Press ENTER to use the default.
Press ^C at any time to quit.

${utilityNameAndVersion}`);

prompts([
  {
    type: "text",
    name: "name",
    initial: appPackage.name,
    validate: (/** @type {string} */ name) => {
      const { validForNewPackages, errors, warnings } = validateName(name);
      return (
        validForNewPackages || `Error: ${(errors || warnings).join(", ")}.`
      );
    },
    message: "Application name?",
  },
])
  .then(async (/** @type {{ name: string }} */ { name }) => {
    const dir = path.resolve(name);
    const isUpdate = fs.existsSync(dir);
    /** @type {Step[]} */
    let steps;

    if (isUpdate) {
      /** @type {{ update: boolean }}  */
      const { update } = await prompts([
        {
          type: "confirm",
          name: "update",
          message: `Directory '${dir}' already exists. Do you want to update it?`,
        },
      ]);

      if (!update) {
        console.log();
        throw "Quitting...";
      }

      steps = [
        {
          message: `Updating core files in '${name}'...`,
          action: () => {
            fs.copySync(`${appDir}/src/core`, `${dir}/src/core`);
            fs.copySync(`${appDir}/src/index.js`, `${dir}/src/index.js`);
          },
          ignoreDry: false,
        },
      ];
    } else {
      /** @type {{ token: string }} */
      const { token } = await prompts([
        {
          type: "password",
          name: "token",
          initial: "DISCORD_BOT_TOKEN_PLACEHOLDER",
          message: "Discord bot token?",
        },
      ]);

      steps = [
        {
          message: `Creating directory '${name}'...`,
          action: () => fs.mkdirSync(dir),
          ignoreDry: false,
        },
        {
          message: "Creating boilerplate...",
          action: () => {
            fs.copySync(appDir, dir);
            fs.writeFileSync(
              path.join(dir, ".gitignore"),
              "node_modules/\n.env\n"
            );
          },
          ignoreDry: false,
        },
        {
          message: "Updating package.json...",
          action: () => {
            const description = `Generated by ${utilityNameAndVersion}.`;
            const newPackage = { ...appPackage, name, description };
            fs.writeFileSync(
              path.join(dir, "package.json"),
              `${JSON.stringify(newPackage, null, 2)}\n`
            );
          },
          ignoreDry: false,
        },
        {
          message: "Writing .env...",
          action: () =>
            fs.writeFileSync(
              path.join(dir, ".env"),
              `DISCORD_BOT_TOKEN=${token}`
            ),
          ignoreDry: false,
        },
        {
          message: "Installing modules...",
          action: () => {
            process.chdir(dir);
            execSync("npm ci");
          },
          ignoreDry: false,
        },
        {
          message: "\nGenerating bot invite link...",
          ignoreDry: true,
          action: () => {
            const applicationId = getApplicationId(token);
            console.log(
              applicationId
                ? `Invite your bot: https://discord.com/oauth2/authorize?scope=bot&client_id=${applicationId}`
                : "The given bot token was invalid so no invite link was generated."
            );
          },
        },
      ];
    }

    const [, , ...args] = process.argv;
    const isDryRun = args[0] === "--dry-run";

    console.log();
    steps.forEach(({ message, ignoreDry, action }) => {
      console.log(message);
      if (ignoreDry || !isDryRun) {
        action();
      }
    });

    console.log();
    console.log(`Done!\n\nStart by running:\n\t$ cd ${name}/\n\t$ npm start`);
    process.exit(0);
  })
  .catch(console.error);
