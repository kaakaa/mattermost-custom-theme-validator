const fs = require('fs');
const glob = require('glob')
const {Parser} = require('acorn');
const walk = require('acorn-walk');

const MyParser = Parser.extend(
    require('acorn-jsx')()
)

// Find defined keys of custom theme element in mattermost-webapp
const findDefinedMembers = () => {
    const file = fs.readFileSync('./mattermost-webapp/utils/constants.jsx', {encoding: 'utf-8'});

    let definedKeys;
    walk.simple(MyParser.parse(file, {sourceType: 'module'}), {
        VariableDeclaration(node) {
            const Constants = node.declarations
                .find(n => n.id.name == 'Constants')
            if (!Constants) {
                return;
            }

            const THEME_ELEMENTS = Constants.init.properties
                .find(n => n.key.name == 'THEME_ELEMENTS')
            definedKeys = THEME_ELEMENTS.value.elements
                .map(node => node.properties.find(n => n.key.name == 'id').value.value);
        }
    });
    return definedKeys;
}

// Find refered key in "applyTheme" fund in mattermost-webapp
// For example, if the argument of "changeOpacity" func is undefined, applying theme in mattermost will be failed.
const findReferedMembers = () => {
    const path = './mattermost-webapp/utils/utils.jsx';
    const file = fs.readFileSync(path);
    let set = new Set();

    try {
        // Find usages of theme element in "applyTheme" func
        walk.simple(MyParser.parse(file, {sourceType: 'module'}), {
            FunctionDeclaration(node) {
                if (node.id.name != 'applyTheme') {
                    return;
                }
                walk.simple(node, {
                    MemberExpression(meNode) {
                        if (meNode.object.name != 'theme') {
                            return;
                        }
                        set.add(meNode.property.name);
                    }
                })
            }
        });
    } catch(err) {
        console.log(err);
    }

    // 'type' is not needed.
    set.delete('type');
    return set;
}

// Find invalid(missing) element in defined themes
const findMissingKey = (path, theme, definedMembers, referedMembers) => {
    console.log(path);
    const keys = new Set(Object.keys(theme).concat(definedMembers).concat(Array.from(referedMembers)));
    const ret = Array.from(keys).map(k => {
        let obj = {key: k, decl: false, def: false, ref: false};
        if (Object.keys(theme).includes(k)) obj.decl = true;
        if (definedMembers.includes(k)) obj.def = true;
        if (referedMembers.has(k)) obj.ref = true;
        return obj;
    })

    const missing = [];
    ret.forEach(v => {
        if (v.ref && !v.decl) missing.push(v.key);
    })
    console.log("  Missing : ", missing);
}

/* ------------------- */

// Collect defined element
const definedMembers = findDefinedMembers();
const referedMembers = findReferedMembers();

// Validate local files
glob('./themes/**/*.json', {}, (err, files) => {
    files.forEach(path => findMissingKey(path, require(path), definedMembers, referedMembers));
});

// Validate themes in mattermost-themes
glob('./mattermost-themes/src/themes/*.js', {}, (err, files) => {
    files.forEach(path => {
        const c = fs.readFileSync(path);
        walk.simple(MyParser.parse(c, {sourceType: 'module'}), {
            ExportDefaultDeclaration(node) {
                if (!node.declaration.properties) return;
                const props = node.declaration.properties.find(p => p.key.name == 'theme')
                let theme = {};
                props.value.properties.forEach(p => theme[p.key.name] = p.value.value);
                findMissingKey(path, theme, definedMembers, referedMembers);
            }
        });
    })
});
