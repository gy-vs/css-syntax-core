import { SyntaxError } from '../definition-syntax/SyntaxError.js';

const TAB = 9;
const N = 10;
const F = 12;
const R = 13;
const SPACE = 32;
const NUMBERSIGN = 35;    // #
const ASTERISK = 42;      // *
const PLUSSIGN = 43;      // +
const HYPHENMINUS = 45;   // -
const LESSTHANSIGN = 60;  // <
const GREATERTHANSIGN = 62; // >
const UNDERSCORE = 95;    // _
const VERTICALLINE = 124; // |

// https://drafts.css-houdini.org/css-properties-values-api-1/#supported-names
const dataTypes = new Set([
    'angle',
    'color',
    'custom-ident',
    'image',
    'integer',
    'length',
    'length-percentage',
    'number',
    'percentage',
    'resolution',
    'string',
    'time',
    'transform-function',
    'transform-list',
    'url'
]);

function isWhiteSpace(code) {
    return code === SPACE || code === TAB || code === N || code === R || code === F;
}

function isNameStart(code) {
    return (code >= 65 && code <= 90) ||   // A-Z
           (code >= 97 && code <= 122) ||  // a-z
           code === UNDERSCORE ||
           code >= 0x80;                   // non-ascii
}

function isNameChar(code) {
    return isNameStart(code) ||
           (code >= 48 && code <= 57) ||   // 0-9
           code === HYPHENMINUS;
}

// Parses a syntax descriptor value of @property at-rule as defined in
// https://drafts.css-houdini.org/css-properties-values-api-1/#the-syntax-descriptor
//
// The syntax descriptor has its own grammar which is a subset of the CSS value
// definition syntax:
//
//   syntax        = "*" | component [ "|" component ]*
//   component     = ( "<" data-type-name ">" | <ident> ) multiplier?
//   multiplier    = "+" | "#"
//
// The result is an AST in the same format as definitionSyntax.parse() produces,
// so it can be used with the regular matching facilities (e.g. lexer.match()).
// The universal syntax definition ("*") has no grammar representation,
// null is returned in this case.
export function parsePropertySyntax(source) {
    let pos = 0;

    function charCode() {
        return pos < source.length ? source.charCodeAt(pos) : 0;
    }
    function error(message, offset = pos) {
        throw new SyntaxError(message, source, offset);
    }
    function skipWs() {
        while (isWhiteSpace(charCode())) {
            pos++;
        }
    }
    function scanIdent() {
        const start = pos;

        // https://drafts.csswg.org/css-syntax-3/#ident-token-diagram
        if (charCode() === HYPHENMINUS) {
            pos++;

            if (charCode() === HYPHENMINUS) {
                pos++;
            }
        }

        if (!isNameStart(charCode())) {
            error('Expect an identifier');
        }

        while (isNameChar(charCode())) {
            pos++;
        }

        return source.substring(start, pos);
    }
    function scanMultiplier(component) {
        const code = charCode();

        if (code === PLUSSIGN || code === NUMBERSIGN) {
            pos++;

            component = {
                type: 'Multiplier',
                comma: code === NUMBERSIGN,
                min: 1,
                max: 0,
                term: component
            };

            // a component may be followed by a single multiplier only,
            // i.e. no combinations like `+#` are allowed
            if (charCode() === PLUSSIGN || charCode() === NUMBERSIGN) {
                error('Unexpected multiplier, a component may be followed by a single `+` or `#` only');
            }
        }

        return component;
    }
    function scanComponent() {
        let component;

        if (charCode() === LESSTHANSIGN) {
            pos++;

            const nameOffset = pos;
            const name = scanIdent();

            if (charCode() !== GREATERTHANSIGN) {
                error('Expect `>`');
            }
            pos++;

            const dataType = name.toLowerCase();

            if (!dataTypes.has(dataType)) {
                error(`Unknown data type \`<${name}>\``, nameOffset);
            }

            component = {
                type: 'Type',
                name: dataType,
                opts: null
            };
        } else {
            component = {
                type: 'Keyword',
                name: scanIdent()
            };
        }

        return scanMultiplier(component);
    }
    function scanComponentList() {
        const terms = [scanComponent()];

        while (pos < source.length) {
            skipWs();

            const code = charCode();

            if (pos === source.length || code === VERTICALLINE) {
                break;
            }

            if (code !== LESSTHANSIGN && code !== HYPHENMINUS && !isNameStart(code)) {
                error('Unexpected input');
            }

            terms.push(scanComponent());
        }

        return terms.length === 1 ? terms[0] : {
            type: 'Group',
            terms,
            combinator: ' ',
            disallowEmpty: false,
            explicit: false
        };
    }

    skipWs();

    // the universal syntax definition
    if (charCode() === ASTERISK) {
        pos++;
        skipWs();

        if (pos !== source.length) {
            error('Unexpected input after `*`');
        }

        return null;
    }

    if (pos === source.length) {
        error('Expect a syntax component');
    }

    const terms = [scanComponentList()];

    while (charCode() === VERTICALLINE) {
        pos++;
        skipWs();

        if (pos === source.length) {
            error('Expect a syntax component');
        }

        terms.push(scanComponentList());
        skipWs();
    }

    // reduce redundant group with a single group term,
    // the same as definitionSyntax.parse() does
    if (terms.length === 1 && terms[0].type === 'Group') {
        return terms[0];
    }

    return {
        type: 'Group',
        terms,
        combinator: terms.length > 1 ? '|' : ' ',
        disallowEmpty: false,
        explicit: false
    };
}
