const fs = require('fs');
const glob = require('glob')
const {Parser} = require('acorn');
const walk = require('acorn-walk');


const MyParser = Parser.extend(
    require('acorn-jsx')()
)

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

    /*
    let ret = Object.keys(theme).map(k => {
        let obj = {key: k, decl: true, def: false, re: false}
        if (definedMembers.includes(k)) {
            obj.def = true;
        }
        if (referedMembers.has(k)) {
            obj.ref = true;
        }
        return obj;
    })
    */
    /*
    definedMembers.forEach(k => {
        if (!(ret.some(v => v.key == k))) {
            let obj = {key: k, decl: false, def: true, ref: false};
            if (referedMembers.has(k)) {
                obj.ref = true;
            }
            ret.push(obj);
        }
    })
    */
   /*
    referedMembers.forEach(k => {
        let obj = {key: k, decl: false, def: false, ref: true};
        if (definedMembers.includes(k)) {
            obj.def = true;
        }
        ret.push(obj);
    })
    */

    const missing = [];
    ret.forEach(v => {
        if (v.ref && !v.decl) missing.push(v.key);
    })
    console.log("  Missing : ", missing);
}

const findReferedMembers = () => {
    const path = './mattermost-webapp/utils/utils.jsx';
    const file = fs.readFileSync(path);
    let set = new Set();

    try {
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


const definedMembers = findDefinedMembers();
const referedMembers = findReferedMembers();

console.log(JSON.stringify(definedMembers, null, "  "));
console.log(JSON.stringify(referedMembers, null, "  "));

// Validate local files
glob('./themes/**/*.json', {}, (err, files) => {
    files.forEach(path => findMissingKey(path, require(path), definedMembers, referedMembers));
});

// Validate mattermost-themes
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
