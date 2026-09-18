import { isCustomProperty } from '../utils/names.js';
import { parse as parsePropertySyntax, isUniversalSyntax } from '../property-syntax/index.js';
import { cssWideKeywords } from './generic-const.js';
import prepareTokens from './prepare-tokens.js';
import { tokenTypes } from '../tokenizer/index.js';

const SYNTAX_DESCRIPTOR = 'syntax';
const INHERITS_DESCRIPTOR = 'inherits';
const INITIAL_VALUE_DESCRIPTOR = 'initial-value';
const PROPERTY_ATRULE = 'property';

const cssWideKeywordsSet = new Set(cssWideKeywords);

function descriptorName(node) {
    return node.property.toLowerCase();
}

function valueHasVar(lexer, valueNode) {
    const value = valueNode.type === 'Raw'
        ? valueNode.value
        : valueNode;
    const tokens = prepareTokens(value, lexer.syntax);

    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].value.toLowerCase() === 'var(') {
            return true;
        }
    }

    return false;
}

function getSingleIdentifier(node) {
    if (node.type !== 'Value' || node.children.size !== 1) {
        return null;
    }

    const child = node.children.first;

    return child.type === 'Identifier'
        ? child.name
        : null;
}

function getSingleString(node) {
    if (node.type !== 'Value' || node.children.size !== 1) {
        return null;
    }

    const child = node.children.first;

    return child.type === 'String'
        ? child.value
        : null;
}

function getDeclarations(atrule) {
    const block = atrule.block;

    if (!block || block.type !== 'Block') {
        return null;
    }

    const declarations = [];

    for (const node of block.children) {
        if (node.type === 'Declaration') {
            declarations.push(node);
        }
    }

    return declarations;
}

// Validate a single @property rule.
// On success returns { name, syntax } (registration info),
// on failure returns { error: { message, node, descriptor } }.
function validatePropertyRule(lexer, atrule) {
    if (!atrule || atrule.type !== 'Atrule' ||
        !atrule.name || atrule.name.toLowerCase() !== PROPERTY_ATRULE) {
        return {
            error: {
                message: 'Not an @property rule',
                node: atrule || null,
                descriptor: null
            }
        };
    }

    const declarations = getDeclarations(atrule);

    if (declarations === null) {
        return {
            error: {
                message: '@property rule should contain a block',
                node: atrule,
                descriptor: null
            }
        };
    }

    const preludeNode = atrule.prelude;

    if (preludeNode === null ||
        preludeNode.type !== 'AtrulePrelude' ||
        preludeNode.children.size !== 1 ||
        preludeNode.children.first.type !== 'Identifier') {
        return {
            error: {
                message: '@property rule should contain a custom property name in prelude',
                node: preludeNode || atrule,
                descriptor: null
            }
        };
    }

    const customPropertyNameNode = preludeNode.children.first;

    if (!isCustomProperty(customPropertyNameNode.name)) {
        return {
            error: {
                message: '@property rule prelude should be a custom property name',
                node: customPropertyNameNode,
                descriptor: null
            }
        };
    }

    const descriptors = Object.create(null);

    for (const declaration of declarations) {
        const name = descriptorName(declaration);

        if (name !== SYNTAX_DESCRIPTOR &&
            name !== INHERITS_DESCRIPTOR &&
            name !== INITIAL_VALUE_DESCRIPTOR) {
            return {
                error: {
                    message: 'Unknown @property descriptor `' + declaration.property + '`',
                    node: declaration,
                    descriptor: name
                }
            };
        }

        if (descriptors[name]) {
            return {
                error: {
                    message: 'Duplicate `' + name + '` descriptor',
                    node: declaration,
                    descriptor: name
                }
            };
        }

        descriptors[name] = declaration;
    }

    // syntax descriptor is required
    const syntaxDeclaration = descriptors[SYNTAX_DESCRIPTOR];

    if (!syntaxDeclaration) {
        return {
            error: {
                message: 'Missed required `syntax` descriptor',
                node: atrule,
                descriptor: SYNTAX_DESCRIPTOR
            }
        };
    }

    const syntaxString = getSingleString(syntaxDeclaration.value);

    if (syntaxString === null) {
        return {
            error: {
                message: '`syntax` descriptor should be a single <string>',
                node: syntaxDeclaration,
                descriptor: SYNTAX_DESCRIPTOR
            }
        };
    }

    let syntaxAst;

    try {
        syntaxAst = parsePropertySyntax(syntaxString);
    } catch (e) {
        return {
            error: {
                message: 'Invalid `syntax` descriptor value: ' + (e.rawMessage || e.message),
                node: syntaxDeclaration,
                descriptor: SYNTAX_DESCRIPTOR
            }
        };
    }

    // inherits descriptor is required
    const inheritsDeclaration = descriptors[INHERITS_DESCRIPTOR];

    if (!inheritsDeclaration) {
        return {
            error: {
                message: 'Missed required `inherits` descriptor',
                node: atrule,
                descriptor: INHERITS_DESCRIPTOR
            }
        };
    }

    const inheritsValue = getSingleIdentifier(inheritsDeclaration.value);

    if (inheritsValue !== 'true' && inheritsValue !== 'false') {
        return {
            error: {
                message: '`inherits` descriptor should be `true` or `false`',
                node: inheritsDeclaration,
                descriptor: INHERITS_DESCRIPTOR
            }
        };
    }

    // initial-value descriptor is required unless the syntax is universal
    const initialValueDeclaration = descriptors[INITIAL_VALUE_DESCRIPTOR];
    const universal = isUniversalSyntax(syntaxAst);

    if (!initialValueDeclaration) {
        if (!universal) {
            return {
                error: {
                    message: 'Missed required `initial-value` descriptor for non-universal syntax',
                    node: atrule,
                    descriptor: INITIAL_VALUE_DESCRIPTOR
                }
            };
        }
    } else {
        const matchResult = matchPropertyValue(lexer, syntaxAst, initialValueDeclaration.value);

        if (matchResult === 'var') {
            // an initial value must be computationally independent, so a
            // value with var() can't be used as an initial value
            return {
                error: {
                    message: '`initial-value` descriptor value must not contain var()',
                    node: initialValueDeclaration,
                    descriptor: INITIAL_VALUE_DESCRIPTOR
                }
            };
        }

        if (!matchResult) {
            return {
                error: {
                    message: '`initial-value` descriptor value doesn\'t match syntax `' + syntaxString + '`',
                    node: initialValueDeclaration,
                    descriptor: INITIAL_VALUE_DESCRIPTOR
                }
            };
        }
    }

    return {
        name: customPropertyNameNode.name,
        syntax: syntaxAst
    };
}

// Validate a single @property rule node.
// Returns null when the rule is valid, otherwise an error object:
// { message, node, descriptor }
export function checkPropertyRule(lexer, atrule) {
    const result = validatePropertyRule(lexer, atrule);

    return result.error || null;
}

// Match a declaration value against a property syntax.
// Returns:
//   true  - value matches the syntax
//   false - value doesn't match
//   'var' - value contains var() and can't be checked at build time
export function matchPropertyValue(lexer, syntaxAst, valueNode) {
    if (valueHasVar(lexer, valueNode)) {
        return 'var';
    }

    const value = valueNode.type === 'Raw'
        ? valueNode.value
        : valueNode;

    return Boolean(lexer.match(syntaxAst, value).matched);
}

function isCssWideKeyword(lexer, valueNode) {
    const value = valueNode.type === 'Raw'
        ? valueNode.value
        : valueNode;
    const tokens = prepareTokens(value, lexer.syntax);
    let singleIdent = null;

    for (const token of tokens) {
        if (token.type === tokenTypes.WhiteSpace) {
            continue;
        }

        if (singleIdent === null && token.type === tokenTypes.Ident) {
            singleIdent = token.value.toLowerCase();
        } else {
            return false;
        }
    }

    return singleIdent !== null && cssWideKeywordsSet.has(singleIdent);
}

// Walk a stylesheet, collect @property registrations and check declarations
// of the registered custom properties against their syntax.
// Returns an array of error objects ({ message, node, descriptor }).
export function checkCustomProperties(lexer, ast) {
    const errors = [];
    const registrations = new Map();

    // first pass: collect registrations from valid @property rules
    lexer.syntax.walk(ast, {
        visit: 'Atrule',
        enter(atrule) {
            if (!atrule.name || atrule.name.toLowerCase() !== PROPERTY_ATRULE) {
                return;
            }

            const result = validatePropertyRule(lexer, atrule);

            if (result.error) {
                errors.push(result.error);
                return;
            }

            if (!registrations.has(result.name)) {
                registrations.set(result.name, result.syntax);
            }
        }
    });

    if (registrations.size === 0) {
        return errors;
    }

    // second pass: check declarations of registered custom properties;
    // @property descriptor names (syntax/inherits/initial-value) are not
    // custom property names, so declarations inside @property blocks
    // don't reach the checks below
    lexer.syntax.walk(ast, {
        visit: 'Declaration',
        enter(declaration) {
            if (!isCustomProperty(declaration.property) ||
                !registrations.has(declaration.property)) {
                return;
            }

            // css-wide keywords are always valid for custom properties
            if (isCssWideKeyword(lexer, declaration.value)) {
                return;
            }

            const matchResult = matchPropertyValue(
                lexer,
                registrations.get(declaration.property),
                declaration.value
            );

            if (matchResult === false) {
                errors.push({
                    message: 'Value for registered custom property `' + declaration.property +
                        '` doesn\'t match registered syntax',
                    node: declaration,
                    descriptor: null
                });
            }
        }
    });

    return errors;
}
