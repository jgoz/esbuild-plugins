import process from 'node:process';
import {
  Application,
  Comment,
  DeclarationReflection,
  ReflectionKind,
  SignatureReflection,
  TSConfigReader,
} from 'typedoc';

function escape(str) {
  return str?.replace(/\|/g, '\\|').replace(/\n{2}/g, '<br><br>').replace(/\n/g, ' ') ?? '';
}

function escapeCode(str) {
  return str?.trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>') ?? '';
}

/**
 * @param {DeclarationReflection | SignatureReflection} decl
 */
function getType(decl) {
  if (decl.kind === ReflectionKind.CallSignature) {
    const params =
      /** @type {SignatureReflection} */ (decl).parameters?.map(
        param => `${param.name}: ${getType(param)}`,
      ) ?? [];
    return `(${params.join(', ')}) => ${decl.type?.toString() ?? 'any'}`;
  }

  return decl.type?.toString() ?? 'any';
}

/**
 * @param {string} text
 */
function extractLink(text) {
  if (!text) return undefined;
  const match = /\{@link (.*)\}/.exec(text);
  return match.at(1);
}

/**
 * @param {string} text
 */
function extractDefault(text) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed === 'undefined') return '';
  return trimmed;
}

/**
 * @param {Comment | undefined} comment
 */
function formatComment(comment) {
  if (!comment) {
    return '-';
  }

  let text = escape(comment.shortText);
  if (comment.text) {
    text += `<br><br>${escape(comment.text)}`;
  }

  if (comment.hasTag('example')) {
    text += `<br><details><summary>Example</summary><pre>${escapeCode(
      comment.getTag('example').text,
    )}</pre></details>`;
  }

  return text;
}

/**
 * @param {DeclarationReflection | SignatureReflection} decl
 */
function printDecl(decl, required) {
  const name = required ? `${decl.name} (*)` : decl.name;
  const nameLink = extractLink(decl.comment?.getTag('see')?.text);
  const nameWithLink = nameLink ? `[${name}](${nameLink})` : name;

  const type = getType(decl);
  const typeCol = `\`${escape(type)}\``;

  const defaultValue = extractDefault(decl.comment?.getTag('default')?.text);
  const defaultCol = defaultValue ? `\`${escape(defaultValue)}\`` : '';

  const comment = formatComment(decl.comment);

  console.log(`| ${nameWithLink} | ${typeCol} | ${defaultCol} | ${comment} |`);
}

function writeTable(entryPoint, name) {
  const app = new Application();
  app.options.addReader(new TSConfigReader());
  app.bootstrap({
    entryPoints: [entryPoint],
    readme: 'none',
  });
  const project = app.convert();
  const reflection = project.findReflectionByName(name);

  if (!reflection) {
    console.warn(`Could not find reflection for ${name}`);
    return;
  }

  if (reflection.kind !== ReflectionKind.Interface) {
    console.warn(`Reflection for ${name} is not an interface`);
    return;
  }

  console.log('| Name | Type | Default | Description |');
  console.log('| --- | --- | --- | --- |');
  for (const child of /** @type {DeclarationReflection} */ (reflection).children) {
    const required = !child.flags.isOptional;
    if (child.signatures) {
      printDecl(child.signatures.at(0), required);
    } else {
      printDecl(child, required);
    }
  }
}

writeTable(process.argv[2], process.argv[3]);
