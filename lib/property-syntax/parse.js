// A parser for the syntax string of the `syntax` descriptor defined by
// the CSS Properties and Values API (https://drafts.css-houdini.org/css-properties-values-api/#the-syntax-descriptor)
//
// The syntax is a subset of the CSS value definition syntax:
//
//   syntax-string     = universal-syntax | list-of-components
//   universal-syntax  = "*"
//   list-of-components = component ( "|" component )*
//   component         = component-name ( ( "+" ) / ( "#" ) )?
//   component-name    = "<" type-name ">" | ident
//
// Spaces are allowed around the components and the "|" combinator.
//
// The result AST uses the same node shapes (Group, Type, Keyword, Multiplier)
// as lib/definition-syntax, so it can be passed to Lexer#match() directly.
import { SyntaxError } from '../definition-syntax/SyntaxError.js';

const TAB = 9;
const N = 10;
const F = 12;
const R = 13;
const SPACE = 32;
const HYPHENMINUS = 45;       // -
const ASTERISK = 42;          // *
const PLUSSIGN = 43;          // +
const NUMBERSIGN = 35;        // #
const LESSTHANSIGN = 60;      // <
const GREATERTHANSIGN = 62;   // >
const VERTICALLINE = 124;     // |

// https://drafts.css-houdini.org/css-properties-values-api/#supported-names
export const supportedSyntaxTypes = new Set([
    'length',
    'number',
    'percentage',
    'length-percentage',
    'color',
    'image',
    'url',
    'integer',
    'angle',
    'time',
    'resolution',
    'transform-function',
    'transform-list',
    'custom-ident',
    'string'
]);

const NAME_CHAR = new Uint8Array(128).map((_, idx) =>
    (idx >= 0x30 && idx <= 0x39) ||  // 0-9
    (idx >= 0x41 && idx <= 0x5A) ||  // A-Z
    (idx >= 0x61 && idx <= 0x7A) ||  // a-z
    idx === HYPHENMINUS
        ? 1
        : 0
);

class Scanner {
    constructor(str) {
        this.str = str;
        this.pos = 0;
    }

    charCodeAt(pos) {
        return pos < this.str.length ? this.str.charCodeAt(pos) : 0;
    }
    charCode() {
        return this.charCodeAt(this.pos);
    }
    nextCharCode() {
        return this.charCodeAt(this.pos + 1);
    }
    isNameCharCode(code = this.charCode()) {
        return code < 128 && NAME_CHAR[code] === 1;
    }
    skipWs() {
        for (let pos = this.pos; pos < this.str.length; pos++) {
            const code = this.str.charCodeAt(pos);

            if (code !== SPACE && code !== TAB && code !== N && code !== R && code !== F) {
                this.pos = pos;
                return;
            }
        }

        this.pos = this.str.length;
    }
    eat(code) {
        if (this.charCode() !== code) {
            this.error('Expect `' + String.fromCharCode(code) + '`');
        }

        this.pos++;
    }
    scanWord() {
        const start = this.pos;

        while (this.isNameCharCode()) {
            this.pos++;
        }

        if (this.pos === start) {
            this.error('Expect an identifier');
        }

        return this.str.substring(start, this.pos);
    }
    error(message) {
        throw new SyntaxError(message, this.str, this.pos);
    }
}

// <type-name>
function readType(scanner) {
    scanner.eat(LESSTHANSIGN);

    const nameStart = scanner.pos;
    const name = scanner.scanWord();

    scanner.eat(GREATERTHANSIGN);

    if (!supportedSyntaxTypes.has(name)) {
        scanner.pos = nameStart;
        scanner.error('Unknown syntax type `' + name + '`');
    }

    return {
        type: 'Type',
        name,
        opts: null
    };
}

// a literal component: an identifier
function readLiteral(scanner) {
    return {
        type: 'Keyword',
        name: scanner.scanWord()
    };
}

// ( "+" / "#" )? — at most one, right after a component
function maybeMultiplier(scanner, term) {
    const code = scanner.charCode();

    if (code !== PLUSSIGN && code !== NUMBERSIGN) {
        return term;
    }

    const comma = code === NUMBERSIGN;
    scanner.pos++;

    // multipliers can't be stacked or appear in any other position
    if (scanner.charCode() === PLUSSIGN || scanner.charCode() === NUMBERSIGN) {
        scanner.error('Unexpected multiplier');
    }

    return {
        type: 'Multiplier',
        comma,
        min: 1,
        max: 0,
        term
    };
}

// component = component-name ( ( "+" ) / ( "#" ) )?
function readComponent(scanner) {
    const term = scanner.charCode() === LESSTHANSIGN
        ? readType(scanner)
        : readLiteral(scanner);

    return maybeMultiplier(scanner, term);
}

function isEnd(scanner) {
    return scanner.charCode() === 0;
}

export function parse(source) {
    const scanner = new Scanner(source);

    scanner.skipWs();

    // universal syntax
    if (scanner.charCode() === ASTERISK) {
        scanner.pos++;
        scanner.skipWs();

        if (!isEnd(scanner)) {
            scanner.error('Unexpected input');
        }

        return universalSyntaxAst;
    }

    const terms = [];

    do {
        terms.push(readComponent(scanner));
        scanner.skipWs();

        if (scanner.charCode() === VERTICALLINE) {
            scanner.pos++;
            scanner.skipWs();

            if (isEnd(scanner)) {
                scanner.error('Expect a component');
            }

            continue;
        }

        break;
    } while (!isEnd(scanner));

    if (!isEnd(scanner)) {
        scanner.error('Unexpected input');
    }

    if (terms.length === 0) {
        scanner.error('Expect a component');
    }

    return {
        type: 'Group',
        terms,
        combinator: terms.length > 1 ? '|' : ' ',
        disallowEmpty: false,
        explicit: false
    };
}

// Universal syntax accepts any sequence of one or more tokens. Reuse the
// lexer's generic <declaration-value> type instead of a custom matcher, so
// the result goes through the same matching mechanism.
export const universalSyntaxAst = Object.freeze({
    type: 'Group',
    universal: true,
    terms: [
        Object.freeze({
            type: 'Type',
            name: 'declaration-value',
            opts: null
        })
    ],
    combinator: ' ',
    disallowEmpty: false,
    explicit: false
});

export function isUniversalSyntax(ast) {
    return Boolean(ast && ast.universal === true);
}
