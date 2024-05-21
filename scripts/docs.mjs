import process from 'node:process';
import {
  Application,
  Comment,
  DeclarationReflection,
  ReflectionKind,
  Type,
  SignatureReflection,
  TSConfigReader,
} from 'typedoc';

function escape(str) {
  return (
    str
      ?.replace(/\|/g, '\\|')
      .replace(/\n{2}/g, '<br><br>')
      .replace(/\n- /g, '<li>')
      .replace(/\n/g, ' ') ?? ''
  );
}

/**
 * @param {string} str
 * @returns string
 */
function unescapeTsCode(str) {
  return str.startsWith('```ts\n') ? str.replace(/^```ts\n/, '').replace(/\n```$/, '') : str;
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeCode(str) {
  return str?.trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>') ?? '';
}

/**
 * @param {import('typedoc').CommentDisplayPart[] | undefined} display
 */
function extractText(display) {
  return display?.map(part => part.text).join('') ?? '';
}

/**
 * @param {Type | undefined} type
 */
function typeStr(type) {
  if (type?.type === 'reference' && type.reflection?.type) {
    return typeStr(type.reflection.type);
  }

  if (type?.type === 'union' && type?.types?.length > 0) {
    return type.types.map(type => typeStr(type)).join(' | ');
  }

  if (type?.type === 'reflection' && type.declaration?.signatures) {
    return getType(type.declaration.signatures.at(0));
  }

  return type?.toString() ?? 'any';
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
    return `(${params.join(', ')}) => ${typeStr(decl.type)}`;
  }

  return typeStr(decl.type);
}

/**
 * @param {string} text
 */
function extractLink(text) {
  if (!text) return undefined;
  const match = /\{@link (.*)\}/.exec(text);
  return match?.at(1) ?? text;
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

  let text = escape(extractText(comment.summary));

  const example = comment.getTag('@example');
  if (example) {
    text += `<br><br><details><summary>Example</summary><pre>${escapeCode(
      unescapeTsCode(extractText(example.content)),
    )}</pre></details>`;
  }

  return text;
}

/**
 * @param {DeclarationReflection | SignatureReflection} decl
 */
function printDecl(decl, required) {
  const name = required ? `${decl.name} (*)` : decl.name;
  const nameLink = extractLink(extractText(decl.comment?.getTag('@see')?.content));
  const nameWithLink = nameLink ? `[${name}](${nameLink})` : name;

  const type = `\`${escape(getType(decl))}\``;

  const defaultValue =
    decl.defaultValue ??
    extractDefault(unescapeTsCode(extractText(decl.comment?.getTag('@default')?.content)));
  const default_ = defaultValue ? `\`${defaultValue}\`` : '-';

  const comment = formatComment(decl.comment);

  console.log(`| ${nameWithLink} | ${type} | ${default_} | ${comment} |`);
}

/**
 * @param {string} entryPoint
 * @param {string} name
 */
async function writeTable(entryPoint, name) {
  const app = await Application.bootstrap(
    {
      entryPoints: [entryPoint],
      readme: 'none',
    },
    [new TSConfigReader()],
  );
  const project = await app.convert();
  let reflection = project?.getChildByName(name);

  if (!reflection) {
    console.warn(`Could not find reflection for ${name}`);
    return;
  }

  /** @type DeclarationReflection[] | undefined */
  let children;
  if (reflection.kind === ReflectionKind.Interface) {
    children = /** @type {DeclarationReflection} */ (reflection).children;
  } else if (reflection.kind === ReflectionKind.Function) {
    reflection = reflection.signatures.at(0);
    children = reflection.parameters;
  } else {
    console.warn(`Reflection for ${name} is not an interface or function`);
    return;
  }

  if (reflection.comment?.summary?.length) {
    console.log(extractText(reflection.comment.summary));
    console.log();
  }

  const withRequired = children.map(child => [
    child,
    !child.flags.isOptional && child.defaultValue === undefined,
  ]);
  withRequired.sort(([, required1], [, required2]) => {
    if (required2 && !required1) return 1;
    if (required1 && !required2) return -1;
    return 0;
  });

  console.log('| Name | Type | Default | Description |');
  console.log('| ---- | ---- | ------- | ----------- |');
  for (const [child, required] of withRequired) {
    if (child.signatures) {
      printDecl(child.signatures.at(0), required);
    } else {
      printDecl(child, required);
    }
  }
}

writeTable(process.argv[2], process.argv[3]).catch(e => console.error(e));
