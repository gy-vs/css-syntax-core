import assert from 'assert';
import { parse, lexer } from 'css-tree';

const checkCustomProperties = css => lexer.checkCustomProperties(parse(css));

describe('Lexer#checkCustomProperties()', () => {
    it('should return false when there are no problems', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --gap: 10px; }
            b { --gap: 2em; }
        `);

        assert.strictEqual(problems, false);
    });

    it('should return false when there is nothing to check', () => {
        assert.strictEqual(checkCustomProperties('a { color: red; }'), false);
        assert.strictEqual(checkCustomProperties('a { --unregistered: 0; }'), false);
    });

    it('should report a value that doesn\'t match the registered syntax', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --gap: red; }
        `);

        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].node.type, 'Declaration');
        assert.strictEqual(problems[0].node.property, '--gap');
        assert.strictEqual(problems[0].message, 'Value for `--gap` doesn\'t match the registered syntax\n' +
            'Mismatch\n' +
            '  syntax: <length>\n' +
            '   value: red\n' +
            '  --------^');
    });

    it('an unitless zero doesn\'t match a registered <length>', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --gap: 0; }
        `);

        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].node.property, '--gap');
    });

    it('should check a value against alternatives and multipliers', () => {
        const problems = checkCustomProperties(`
            @property --shadow { syntax: "<length>#"; inherits: false; initial-value: 0px; }
            a { --shadow: 1px, 2px; }
            b { --shadow: 1px 2px; }
        `);

        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].node.property, '--shadow');
    });

    it('should accept any value for the universal syntax', () => {
        const problems = checkCustomProperties(`
            @property --any { syntax: "*"; inherits: true; }
            a { --any: 0; }
            b { --any: red 1px, url(foo.png); }
        `);

        assert.strictEqual(problems, false);
    });

    it('should accept CSS-wide keywords', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --gap: inherit; }
            b { --gap: initial; }
            c { --gap: revert-layer; }
        `);

        assert.strictEqual(problems, false);
    });

    it('should not report values with var() since they can\'t be verified', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --gap: var(--x); }
            b { --gap: calc(var(--x) * 2); }
        `);

        assert.strictEqual(problems, false);
    });

    it('should not check unregistered custom properties', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --other: red; }
        `);

        assert.strictEqual(problems, false);
    });

    it('custom property names are case sensitive', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --GAP: red; }
            b { --Gap: 1px; }
        `);

        assert.strictEqual(problems, false);
    });

    it('should report an invalid @property rule', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0; }
            a { --gap: 1px; }
        `);

        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].node.type, 'Declaration');
        assert.strictEqual(problems[0].node.property, 'initial-value');
        assert(problems[0].message.startsWith('`initial-value` descriptor value doesn\'t match the syntax'));
    });

    it('an invalid @property rule doesn\'t register the property', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; }
            a { --gap: red; }
        `);

        // a single problem about the rule itself, the declaration is not checked
        assert.strictEqual(problems.length, 1);
        assert(problems[0].message.startsWith('Missing required `initial-value` descriptor'));
    });

    it('the last valid registration wins', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<color>"; inherits: false; initial-value: red; }
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            a { --gap: 1px; }
            b { --gap: red; }
        `);

        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].node.property, '--gap');
        assert(problems[0].message.includes('syntax: <length>'));
    });

    it('an invalid rule doesn\'t override a previous valid registration', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            @property --gap { syntax: "<color>"; inherits: false; initial-value: 0; }
            a { --gap: red; }
        `);

        // the invalid rule is reported, the declaration is checked against the first registration
        assert.strictEqual(problems.length, 2);
        assert(problems[0].message.startsWith('`initial-value` descriptor value doesn\'t match the syntax'));
        assert(problems[1].message.startsWith('Value for `--gap` doesn\'t match the registered syntax'));
    });

    it('a registration applies to declarations before it', () => {
        const problems = checkCustomProperties(`
            a { --gap: red; }
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
        `);

        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].node.property, '--gap');
    });

    it('should check declarations in any nesting', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            @media screen {
                a { --gap: red; }
            }
        `);

        assert.strictEqual(problems.length, 1);
        assert.strictEqual(problems[0].node.property, '--gap');
    });

    it('should report every problem found', () => {
        const problems = checkCustomProperties(`
            @property --gap { syntax: "<length>"; inherits: false; initial-value: 0px; }
            @property --color { syntax: "<color>"; inherits: false; initial-value: red; }
            a { --gap: red; --color: 1px; }
            b { --gap: 1px; --color: blue; }
        `);

        assert.strictEqual(problems.length, 2);
        assert.strictEqual(problems[0].node.property, '--gap');
        assert.strictEqual(problems[1].node.property, '--color');
    });
});
