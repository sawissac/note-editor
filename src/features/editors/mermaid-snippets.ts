/**
 * Mermaid snippets offered by the code editor's autocomplete in .mermaid /
 * .mmd files. Bodies use VS Code snippet syntax: `${1:placeholder}` tab stops,
 * `${1|a,b|}` choices, `$0` final caret. Literal `$` and `}` must be escaped.
 *
 * `diagram` snippets are whole starter documents (one per diagram type the
 * bundled Mermaid version supports); `syntax` snippets are single statements
 * for use inside a diagram, grouped by the diagram they belong to.
 */
export type MermaidSnippet = {
  /** What the user types to find it. */
  prefix: string;
  /** Short label shown beside the prefix. */
  detail: string;
  kind: "diagram" | "syntax";
  /** Diagram the statement belongs to (syntax snippets only). */
  scope?: string;
  body: string[];
};

const diagram = (prefix: string, detail: string, body: string[]): MermaidSnippet => ({
  prefix,
  detail,
  kind: "diagram",
  body,
});

const syntax =
  (scope: string) =>
  (prefix: string, detail: string, body: string[] | string): MermaidSnippet => ({
    prefix,
    detail,
    kind: "syntax",
    scope,
    body: typeof body === "string" ? [body] : body,
  });

/* ───────────────────────── Diagram starters ───────────────────────── */

const DIAGRAMS: MermaidSnippet[] = [
  diagram("flowchart", "Flowchart", [
    "flowchart ${1|TD,TB,BT,LR,RL|}",
    "  ${2:A}[${3:Start}] --> ${4:B}{${5:Decision}}",
    "  $4 -->|${6:Yes}| ${7:C}[${8:Do it}]",
    "  $4 -->|${9:No}| ${10:D}[${11:Skip}]",
    "  $0",
  ]),
  diagram("graph", "Flowchart (graph keyword)", [
    "graph ${1|TD,TB,BT,LR,RL|}",
    "  ${2:A} --> ${3:B}",
    "  $0",
  ]),
  diagram("flowchart-elk", "Flowchart (ELK layout)", [
    "flowchart-elk ${1|TD,LR|}",
    "  ${2:A} --> ${3:B}",
    "  $0",
  ]),
  diagram("sequenceDiagram", "Sequence diagram", [
    "sequenceDiagram",
    "  participant ${1:Alice}",
    "  participant ${2:Bob}",
    "  $1->>$2: ${3:Hello Bob}",
    "  $2-->>$1: ${4:Hi Alice}",
    "  $0",
  ]),
  diagram("classDiagram", "Class diagram", [
    "classDiagram",
    "  class ${1:Animal} {",
    "    +${2:String} ${3:name}",
    "    +${4:move}()",
    "  }",
    "  class ${5:Dog}",
    "  $1 <|-- $5",
    "  $0",
  ]),
  diagram("stateDiagram-v2", "State diagram", [
    "stateDiagram-v2",
    "  [*] --> ${1:Idle}",
    "  $1 --> ${2:Running}: ${3:start}",
    "  $2 --> $1: ${4:stop}",
    "  $2 --> [*]",
    "  $0",
  ]),
  diagram("stateDiagram", "State diagram (v1)", [
    "stateDiagram",
    "  [*] --> ${1:Still}",
    "  $1 --> [*]",
    "  $0",
  ]),
  diagram("erDiagram", "Entity relationship diagram", [
    "erDiagram",
    "  ${1:CUSTOMER} ||--o{ ${2:ORDER} : ${3:places}",
    "  $1 {",
    "    string ${4:name}",
    "    string ${5:email} PK",
    "  }",
    "  $2 {",
    "    int ${6:id} PK",
    "    date ${7:created}",
    "  }",
    "  $0",
  ]),
  diagram("journey", "User journey", [
    "journey",
    "  title ${1:My working day}",
    "  section ${2:Go to work}",
    "    ${3:Make tea}: ${4|1,2,3,4,5|}: ${5:Me}",
    "    ${6:Do work}: ${7|1,2,3,4,5|}: ${8:Me, Cat}",
    "  $0",
  ]),
  diagram("gantt", "Gantt chart", [
    "gantt",
    "  title ${1:Project plan}",
    "  dateFormat ${2:YYYY-MM-DD}",
    "  section ${3:Design}",
    "    ${4:Research} :${5:a1}, ${6:2026-01-01}, ${7:7d}",
    "    ${8:Mockups} :after $5, ${9:5d}",
    "  section ${10:Build}",
    "    ${11:Implement} :${12:2026-01-15}, ${13:14d}",
    "    ${14:Launch} :milestone, ${15:2026-02-01}, 0d",
    "  $0",
  ]),
  diagram("pie", "Pie chart", [
    "pie ${1:showData}",
    "  title ${2:Pets adopted}",
    '  "${3:Dogs}" : ${4:386}',
    '  "${5:Cats}" : ${6:85}',
    '  "${7:Rats}" : ${8:15}',
    "  $0",
  ]),
  diagram("quadrantChart", "Quadrant chart", [
    "quadrantChart",
    "  title ${1:Reach and engagement}",
    "  x-axis ${2:Low Reach} --> ${3:High Reach}",
    "  y-axis ${4:Low Engagement} --> ${5:High Engagement}",
    "  quadrant-1 ${6:Expand}",
    "  quadrant-2 ${7:Promote}",
    "  quadrant-3 ${8:Re-evaluate}",
    "  quadrant-4 ${9:Improve}",
    "  ${10:Campaign A}: [${11:0.3}, ${12:0.6}]",
    "  ${13:Campaign B}: [${14:0.45}, ${15:0.23}]",
    "  $0",
  ]),
  diagram("requirementDiagram", "Requirement diagram", [
    "requirementDiagram",
    "  requirement ${1:test_req} {",
    "    id: ${2:1}",
    "    text: ${3:the test text.}",
    "    risk: ${4|high,medium,low|}",
    "    verifymethod: ${5|test,analysis,inspection,demonstration|}",
    "  }",
    "  element ${6:test_entity} {",
    "    type: ${7:simulation}",
    "  }",
    "  $6 - satisfies -> $1",
    "  $0",
  ]),
  diagram("gitGraph", "Git graph", [
    "gitGraph",
    "  commit",
    "  branch ${1:develop}",
    "  checkout $1",
    "  commit",
    "  checkout ${2:main}",
    "  merge $1",
    "  $0",
  ]),
  diagram("C4Context", "C4 system context", [
    "C4Context",
    "  title ${1:System Context diagram}",
    '  Person(${2:customer}, "${3:Customer}", "${4:A customer of the bank}")',
    '  System(${5:banking}, "${6:Internet Banking}", "${7:Lets customers view their accounts}")',
    '  Rel($2, $5, "${8:Uses}")',
    "  $0",
  ]),
  diagram("C4Container", "C4 container", [
    "C4Container",
    "  title ${1:Container diagram}",
    '  Person(${2:user}, "${3:User}")',
    '  System_Boundary(${4:b1}, "${5:System}") {',
    '    Container(${6:web}, "${7:Web App}", "${8:React}")',
    '    ContainerDb(${9:db}, "${10:Database}", "${11:PostgreSQL}")',
    "  }",
    '  Rel($2, $6, "${12:Uses}", "${13:HTTPS}")',
    '  Rel($6, $9, "${14:Reads/writes}")',
    "  $0",
  ]),
  diagram("C4Component", "C4 component", [
    "C4Component",
    "  title ${1:Component diagram}",
    '  Container_Boundary(${2:api}, "${3:API}") {',
    '    Component(${4:ctrl}, "${5:Controller}", "${6:REST}")',
    '    Component(${7:svc}, "${8:Service}", "${9:Domain logic}")',
    "  }",
    '  Rel($4, $7, "${10:Calls}")',
    "  $0",
  ]),
  diagram("C4Dynamic", "C4 dynamic", [
    "C4Dynamic",
    "  title ${1:Dynamic diagram}",
    '  ContainerDb(${2:db}, "${3:Database}")',
    '  Container(${4:app}, "${5:App}")',
    '  Rel($4, $2, "${6:Reads}")',
    "  $0",
  ]),
  diagram("C4Deployment", "C4 deployment", [
    "C4Deployment",
    "  title ${1:Deployment diagram}",
    '  Deployment_Node(${2:cloud}, "${3:Cloud}", "${4:AWS}") {',
    '    Container(${5:api}, "${6:API}", "${7:Node.js}")',
    "  }",
    "  $0",
  ]),
  diagram("mindmap", "Mind map", [
    "mindmap",
    "  root((${1:Topic}))",
    "    ${2:Origins}",
    "      ${3:Long history}",
    "    ${4:Research}",
    "      ${5:On effectiveness}",
    "    $0",
  ]),
  diagram("timeline", "Timeline", [
    "timeline",
    "  title ${1:History of social media}",
    "  ${2:2002} : ${3:LinkedIn}",
    "  ${4:2004} : ${5:Facebook} : ${6:Google}",
    "  ${7:2005} : ${8:YouTube}",
    "  $0",
  ]),
  diagram("sankey", "Sankey diagram", [
    "sankey",
    "",
    "${1:Source},${2:Target},${3:10}",
    "${4:Source},${5:Other},${6:5}",
    "$0",
  ]),
  diagram("xychart", "XY chart (bar + line)", [
    "xychart",
    '  title "${1:Sales Revenue}"',
    "  x-axis [${2:jan, feb, mar, apr}]",
    '  y-axis "${3:Revenue (in \\$)}" ${4:0} --> ${5:10000}',
    "  bar [${6:5000, 6000, 7500, 8200}]",
    "  line [${7:5000, 6000, 7500, 8200}]",
    "  $0",
  ]),
  diagram("block", "Block diagram", [
    "block",
    "  columns ${1:3}",
    '  ${2:a}["${3:A}"] ${4:b}["${5:B}"] ${6:c}["${7:C}"]',
    "  $2 --> $4",
    "  $4 --> $6",
    "  $0",
  ]),
  diagram("packet", "Packet diagram", [
    "packet",
    '  title "${1:TCP Packet}"',
    '  0-15: "${2:Source Port}"',
    '  16-31: "${3:Destination Port}"',
    '  32-63: "${4:Sequence Number}"',
    "  $0",
  ]),
  diagram("kanban", "Kanban board", [
    "kanban",
    "  ${1:todo}[${2:Todo}]",
    "    ${3:t1}[${4:Write docs}]",
    "  ${5:doing}[${6:In progress}]",
    "    ${7:t2}[${8:Build feature}]",
    "  ${9:done}[${10:Done}]",
    "  $0",
  ]),
  diagram("architecture-beta", "Architecture diagram", [
    "architecture-beta",
    "  group ${1:api}(cloud)[${2:API}]",
    "  service ${3:db}(database)[${4:Database}] in $1",
    "  service ${5:server}(server)[${6:Server}] in $1",
    "  $3:L -- R:$5",
    "  $0",
  ]),
  diagram("radar-beta", "Radar chart", [
    "radar-beta",
    "  title ${1:Skills}",
    '  axis ${2:a}["${3:Speed}"], ${4:b}["${5:Power}"], ${6:c}["${7:Range}"]',
    '  curve ${8:x}["${9:Player 1}"]{${10:4, 3, 5}}',
    '  curve ${11:y}["${12:Player 2}"]{${13:2, 5, 3}}',
    "  max ${14:5}",
    "  $0",
  ]),
  diagram("treemap", "Treemap", [
    "treemap",
    '"${1:Section 1}"',
    '    "${2:Leaf 1.1}": ${3:12}',
    '    "${4:Leaf 1.2}": ${5:8}',
    '"${6:Section 2}"',
    '    "${7:Leaf 2.1}": ${8:20}',
    "$0",
  ]),
  diagram("ishikawa", "Ishikawa (fishbone) diagram", [
    "ishikawa",
    "  ${1:Late delivery}",
    "    ${2:People}",
    "      ${3:Understaffed}",
    "    ${4:Process}",
    "      ${5:No review step}",
    "    $0",
  ]),
  diagram("usecase-beta", "Use case diagram", [
    "usecase-beta",
    "  direction ${1|LR,TB|}",
    "  actor ${2:Customer}",
    "  systemBoundary ${3:Shop}",
    "    ${4:Login}",
    "    ${5:Checkout}",
    "  end",
    "  $2 --> $4",
    "  $2 --> $5",
    "  $0",
  ]),
  diagram("swimlane-beta", "Swimlane diagram", [
    "swimlane-beta ${1|LR,TB|}",
    "  subgraph ${2:Customer}",
    "    ${3:a}[${4:Place order}]",
    "  end",
    "  subgraph ${5:Shop}",
    "    ${6:b}[${7:Ship order}]",
    "  end",
    "  $3 --> $6",
    "  $0",
  ]),
  diagram("agentflow-beta", "Agent flow", [
    "agentflow-beta",
    "  ${1:start} --> ${2:plan}",
    "  $2 --> ${3:act}",
    "  $3 --> ${4:done}",
    "  $0",
  ]),
  diagram("eventmodeling", "Event modeling", [
    "eventmodeling",
    "  tf 01 ui ${1:AddToCart}",
    "  tf 02 cmd ${2:AddItem} ->> 01",
    "  tf 03 evt ${3:ItemAdded} ->> 02",
    "  tf 04 rmo ${4:CartItems} ->> 03",
    "  $0",
  ]),
  diagram("cynefin-beta", "Cynefin framework", [
    "cynefin-beta",
    "  title ${1:Decision domains}",
    "  complex",
    '    "${2:Probe, sense, respond}"',
    "  complicated",
    '    "${3:Sense, analyze, respond}"',
    "  clear",
    '    "${4:Best practice}"',
    "  chaotic",
    '    "${5:Act, sense, respond}"',
    '  complex --> complicated : "${6:Learn}"',
    "  $0",
  ]),
  diagram("venn-beta", "Venn diagram", [
    "venn-beta",
    "  title ${1:Fruits}",
    '  set ${2:A}["${3:Apples}"]',
    '  set ${4:B}["${5:Bananas}"]',
    '  union $2,$4["${6:Both}"]',
    "  $0",
  ]),
  diagram("wardley-beta", "Wardley map", [
    "wardley-beta",
    "  title ${1:Tea Shop}",
    "  anchor ${2:Business} [${3:0.95}, ${4:0.63}]",
    "  component ${5:Cup of Tea} [${6:0.79}, ${7:0.61}]",
    "  component ${8:Kettle} [${9:0.43}, ${10:0.35}]",
    "  $2 -> $5",
    "  $5 -> $8",
    "  evolve $8 ${11:0.62}",
    "  $0",
  ]),
  diagram("treeView-beta", "Tree view (file tree)", [
    "treeView-beta",
    "  ${1:project}",
    "    ${2:src}",
    "      ${3:index.ts}",
    "    ${4:package.json}$0",
  ]),
  diagram("railroad-beta", "Railroad diagram", [
    "railroad-beta",
    '  ${1:expr} = sequence(terminal("${2:a}"), optional(nonterminal("${3:b}")));',
    "  $0",
  ]),
  diagram("railroad-ebnf-beta", "Railroad diagram (EBNF)", [
    "railroad-ebnf-beta",
    '  ${1:expr} = ${2:term} , { ( "+" | "-" ) , $2 } ;',
    '  $2 = "${3:x}" | "${4:y}" ;',
    "  $0",
  ]),
  diagram("railroad-abnf-beta", "Railroad diagram (ABNF)", [
    "railroad-abnf-beta",
    '  ${1:greeting} = "${2:hello}" / "${3:hi}";',
    "  $0",
  ]),
  diagram("railroad-peg-beta", "Railroad diagram (PEG)", [
    "railroad-peg-beta",
    '  ${1:greeting} <- "${2:hello}" / "${3:hi}";',
    "  $0",
  ]),
  diagram("info", "Mermaid version info", ["info"]),
];

/* ───────────────────────── Statements ───────────────────────── */

const common = syntax("any");
const COMMON: MermaidSnippet[] = [
  common("%%", "Comment", "%% ${1:comment}"),
  common("frontmatter", "Front-matter config (title, theme, look)", [
    "---",
    "title: ${1:Diagram title}",
    "config:",
    "  theme: ${2|default,neutral,dark,forest,base|}",
    "  look: ${3|classic,handDrawn|}",
    "  layout: ${4|dagre,elk|}",
    "---",
    "$0",
  ]),
  common("init", "Init directive", "%%{init: { 'theme': '${1|default,neutral,dark,forest,base|}' } }%%"),
  common("title", "Diagram title", "title ${1:Title}"),
  common("accTitle", "Accessible title", "accTitle: ${1:Title}"),
  common("accDescr", "Accessible description", "accDescr: ${1:Description}"),
  common("accDescr-block", "Accessible description (multi-line)", [
    "accDescr {",
    "  ${1:Description}",
    "}",
  ]),
];

const fc = syntax("flowchart");
const FLOWCHART: MermaidSnippet[] = [
  fc("node-rect", "Node: rectangle", "${1:id}[${2:Text}]"),
  fc("node-round", "Node: rounded", "${1:id}(${2:Text})"),
  fc("node-stadium", "Node: stadium", "${1:id}([${2:Text}])"),
  fc("node-subroutine", "Node: subroutine", "${1:id}[[${2:Text}]]"),
  fc("node-cylinder", "Node: database / cylinder", "${1:id}[(${2:Text})]"),
  fc("node-circle", "Node: circle", "${1:id}((${2:Text}))"),
  fc("node-double-circle", "Node: double circle", "${1:id}(((${2:Text})))"),
  fc("node-asymmetric", "Node: flag / asymmetric", "${1:id}>${2:Text}]"),
  fc("node-rhombus", "Node: decision (rhombus)", "${1:id}{${2:Text}}"),
  fc("node-hexagon", "Node: hexagon", "${1:id}{{${2:Text}}}"),
  fc("node-parallelogram", "Node: parallelogram", "${1:id}[/${2:Text}/]"),
  fc("node-parallelogram-alt", "Node: parallelogram (alt)", "${1:id}[\\\\${2:Text}\\\\]"),
  fc("node-trapezoid", "Node: trapezoid", "${1:id}[/${2:Text}\\\\]"),
  fc("node-trapezoid-alt", "Node: trapezoid (alt)", "${1:id}[\\\\${2:Text}/]"),
  fc("node-shape", "Node: any shape (@{ shape })", [
    "${1:id}@{ shape: ${2|rect,rounded,stadium,subproc,cyl,circle,dbl-circ,diam,hex,lean-r,lean-l,trap-b,trap-t,doc,docs,delay,h-cyl,lin-cyl,curv-trap,div-rect,tri,win-pane,f-circ,lin-doc,lin-rect,notch-pent,flip-tri,sl-rect,tag-doc,tag-rect,bow-rect,fr-circ,cross-circ,bolt,brace,brace-r,braces,comment,cloud,odd,fork,hourglass,notch-rect,st-rect,text,small-circ,sm-circ,framed-circle|}, label: \"${3:Text}\" \\}",
  ]),
  fc("node-icon", "Node: icon", '${1:id}@{ icon: "${2:fa:user}", form: "${3|square,circle,rounded|}", label: "${4:Label}", pos: "${5|t,b|}" \\}'),
  fc("node-image", "Node: image", '${1:id}@{ img: "${2:https://example.com/image.png}", label: "${3:Label}", pos: "${4|t,b|}", w: ${5:60}, h: ${6:60} \\}'),
  fc("link-arrow", "Link: arrow", "${1:A} --> ${2:B}"),
  fc("link-open", "Link: open (no arrow)", "${1:A} --- ${2:B}"),
  fc("link-text", "Link: arrow with label", "${1:A} -->|${2:text}| ${3:B}"),
  fc("link-text-inline", "Link: label inline", "${1:A} -- ${2:text} --> ${3:B}"),
  fc("link-dotted", "Link: dotted", "${1:A} -.-> ${2:B}"),
  fc("link-dotted-text", "Link: dotted with label", "${1:A} -. ${2:text} .-> ${3:B}"),
  fc("link-thick", "Link: thick", "${1:A} ==> ${2:B}"),
  fc("link-thick-text", "Link: thick with label", "${1:A} == ${2:text} ==> ${3:B}"),
  fc("link-invisible", "Link: invisible", "${1:A} ~~~ ${2:B}"),
  fc("link-circle", "Link: circle end", "${1:A} --o ${2:B}"),
  fc("link-cross", "Link: cross end", "${1:A} --x ${2:B}"),
  fc("link-both", "Link: arrows both ways", "${1:A} <--> ${2:B}"),
  fc("link-chain", "Link: chain", "${1:A} --> ${2:B} --> ${3:C}"),
  fc("link-fan", "Link: one to many", "${1:A} --> ${2:B} & ${3:C}"),
  fc("link-id", "Link: with id (for animation)", "${1:A} ${2:e1}@--> ${3:B}"),
  fc("link-animate", "Animate a link by id", "${1:e1}@{ animate: true \\}"),
  fc("subgraph", "Subgraph", [
    "subgraph ${1:id} [${2:Title}]",
    "  direction ${3|TB,BT,LR,RL|}",
    "  $0",
    "end",
  ]),
  fc("direction", "Direction (in subgraph)", "direction ${1|TB,BT,LR,RL|}"),
  fc("classDef", "Define a style class", "classDef ${1:className} fill:${2:#f9f},stroke:${3:#333},stroke-width:${4:2px}"),
  fc("class", "Apply a class to nodes", "class ${1:nodeId} ${2:className}"),
  fc("class-inline", "Apply a class inline", "${1:A}:::${2:className}"),
  fc("style", "Style a node", "style ${1:nodeId} fill:${2:#f9f},stroke:${3:#333},stroke-width:${4:2px}"),
  fc("linkStyle", "Style a link by index", "linkStyle ${1:0} stroke:${2:#ff3},stroke-width:${3:4px}"),
  fc("click-href", "Click: open URL", 'click ${1:nodeId} href "${2:https://example.com}" "${3:Tooltip}" ${4|_blank,_self|}'),
  fc("click-callback", "Click: call function", 'click ${1:nodeId} call ${2:callback}() "${3:Tooltip}"'),
  fc("markdown-string", "Markdown label", '${1:id}["`${2:**bold** _italic_}`"]'),
];

const seq = syntax("sequenceDiagram");
const SEQUENCE: MermaidSnippet[] = [
  seq("participant", "Participant", "participant ${1:A} as ${2:Alice}"),
  seq("actor", "Actor (stick figure)", "actor ${1:A} as ${2:Alice}"),
  seq("participant-type", "Participant with shape", 'participant ${1:DB}@{ "type": "${2|boundary,control,entity,database,collections,queue|}" \\}'),
  seq("create", "Create participant", "create participant ${1:B}"),
  seq("destroy", "Destroy participant", "destroy ${1:B}"),
  seq("box", "Group participants in a box", [
    "box ${1:Aqua} ${2:Group}",
    "  participant ${3:A}",
    "  participant ${4:B}",
    "end",
  ]),
  seq("msg", "Message: solid arrow", "${1:A}->>${2:B}: ${3:message}"),
  seq("msg-reply", "Message: dotted arrow (reply)", "${1:B}-->>${2:A}: ${3:message}"),
  seq("msg-line", "Message: solid line, no arrow", "${1:A}->${2:B}: ${3:message}"),
  seq("msg-dotted-line", "Message: dotted line, no arrow", "${1:A}-->${2:B}: ${3:message}"),
  seq("msg-cross", "Message: cross (lost)", "${1:A}-x${2:B}: ${3:message}"),
  seq("msg-async", "Message: open arrow (async)", "${1:A}-)${2:B}: ${3:message}"),
  seq("msg-both", "Message: bidirectional", "${1:A}<<->>${2:B}: ${3:message}"),
  seq("msg-activate", "Message + activate", "${1:A}->>+${2:B}: ${3:request}"),
  seq("msg-deactivate", "Message + deactivate", "${1:B}-->>-${2:A}: ${3:response}"),
  seq("activate", "Activate", "activate ${1:A}"),
  seq("deactivate", "Deactivate", "deactivate ${1:A}"),
  seq("note", "Note beside a participant", "Note ${1|right of,left of|} ${2:A}: ${3:text}"),
  seq("note-over", "Note over participants", "Note over ${1:A},${2:B}: ${3:text}"),
  seq("loop", "Loop", ["loop ${1:Every minute}", "  $0", "end"]),
  seq("alt", "Alternative paths", ["alt ${1:is sick}", "  $2", "else ${3:is well}", "  $0", "end"]),
  seq("opt", "Optional", ["opt ${1:Extra response}", "  $0", "end"]),
  seq("par", "Parallel", ["par ${1:Alice to Bob}", "  $2", "and ${3:Alice to John}", "  $0", "end"]),
  seq("critical", "Critical region", [
    "critical ${1:Establish a connection}",
    "  $2",
    "option ${3:Network timeout}",
    "  $0",
    "end",
  ]),
  seq("break", "Break", ["break ${1:when the booking process fails}", "  $0", "end"]),
  seq("rect", "Highlight background", ["rect ${1:rgb(191, 223, 255)}", "  $0", "end"]),
  seq("autonumber", "Number messages", "autonumber"),
  seq("link", "Participant menu link", 'link ${1:A}: ${2:Dashboard} @ ${3:https://example.com}'),
];

const cls = syntax("classDiagram");
const CLASS: MermaidSnippet[] = [
  cls("class", "Class with members", ["class ${1:Name} {", "  +${2:String} ${3:field}", "  +${4:method}(${5}) ${6:void}", "}"]),
  cls("class-generic", "Generic class", "class ${1:Box}~${2:T}~"),
  cls("class-label", "Class with label", 'class ${1:Id}["${2:Display name}"]'),
  cls("member", "Add member", "${1:Name} : +${2:method}()"),
  cls("annotation", "Annotation", "<<${1|interface,abstract,service,enumeration|}>> ${2:Name}"),
  cls("inheritance", "Relation: inheritance", "${1:Parent} <|-- ${2:Child}"),
  cls("composition", "Relation: composition", "${1:Whole} *-- ${2:Part}"),
  cls("aggregation", "Relation: aggregation", "${1:Whole} o-- ${2:Part}"),
  cls("association", "Relation: association", "${1:A} --> ${2:B}"),
  cls("dependency", "Relation: dependency", "${1:A} ..> ${2:B}"),
  cls("realization", "Relation: realization", "${1:Class} ..|> ${2:Interface}"),
  cls("link-solid", "Relation: solid link", "${1:A} -- ${2:B}"),
  cls("link-dashed", "Relation: dashed link", "${1:A} .. ${2:B}"),
  cls("cardinality", "Relation with cardinality", '${1:Customer} "${2:1}" --> "${3:*}" ${4:Order} : ${5:places}'),
  cls("namespace", "Namespace", ["namespace ${1:Shapes} {", "  class ${2:Triangle}", "  $0", "}"]),
  cls("note", "Note", 'note "${1:text}"'),
  cls("note-for", "Note for a class", 'note for ${1:Name} "${2:text}"'),
  cls("direction", "Direction", "direction ${1|TB,BT,LR,RL|}"),
];

const st = syntax("stateDiagram");
const STATE: MermaidSnippet[] = [
  st("start", "Start transition", "[*] --> ${1:Idle}"),
  st("end", "End transition", "${1:State} --> [*]"),
  st("transition", "Transition", "${1:A} --> ${2:B}: ${3:event}"),
  st("state-desc", "State with description", "state \"${1:Description}\" as ${2:Id}"),
  st("composite", "Composite state", ["state ${1:Parent} {", "  [*] --> ${2:Child}", "  $0", "}"]),
  st("choice", "Choice", "state ${1:check} <<choice>>"),
  st("fork", "Fork", "state ${1:fork} <<fork>>"),
  st("join", "Join", "state ${1:join} <<join>>"),
  st("concurrency", "Concurrent regions", ["state ${1:Active} {", "  ${2:A} --> ${3:B}", "  --", "  ${4:C} --> ${5:D}", "}"]),
  st("note", "Note", ["note ${1|right of,left of|} ${2:State}", "  ${3:text}", "end note"]),
  st("note-line", "Note (one line)", "note ${1|right of,left of|} ${2:State} : ${3:text}"),
  st("direction", "Direction", "direction ${1|TB,BT,LR,RL|}"),
];

const er = syntax("erDiagram");
const ER: MermaidSnippet[] = [
  er("entity", "Entity with attributes", ["${1:ENTITY} {", "  ${2:string} ${3:name} ${4|PK,FK,UK|}", "  $0", "}"]),
  er("entity-alias", "Entity with alias", "${1:p}[${2:Person}]"),
  er("one-to-many", "Relationship: one to many", "${1:A} ||--o{ ${2:B} : ${3:has}"),
  er("one-to-one", "Relationship: one to one", "${1:A} ||--|| ${2:B} : ${3:is}"),
  er("many-to-many", "Relationship: many to many", "${1:A} }o--o{ ${2:B} : ${3:links}"),
  er("zero-or-one", "Relationship: zero or one", "${1:A} |o--o| ${2:B} : ${3:may have}"),
  er("non-identifying", "Relationship: non-identifying", "${1:A} ||..o{ ${2:B} : ${3:refers}"),
];

const gt = syntax("gantt");
const GANTT: MermaidSnippet[] = [
  gt("dateFormat", "Input date format", "dateFormat ${1:YYYY-MM-DD}"),
  gt("axisFormat", "Axis label format", "axisFormat ${1:%Y-%m-%d}"),
  gt("tickInterval", "Axis tick interval", "tickInterval ${1:1week}"),
  gt("excludes", "Excluded days", "excludes ${1:weekends}"),
  gt("weekday", "Week start", "weekday ${1|monday,tuesday,wednesday,thursday,friday,saturday,sunday|}"),
  gt("todayMarker", "Today marker", "todayMarker ${1:off}"),
  gt("section", "Section", "section ${1:Name}"),
  gt("task", "Task", "${1:Task} :${2:t1}, ${3:2026-01-01}, ${4:3d}"),
  gt("task-after", "Task after another", "${1:Task} :${2:t2}, after ${3:t1}, ${4:5d}"),
  gt("task-status", "Task with status", "${1:Task} :${2|done,active,crit|}, ${3:t3}, ${4:2026-01-01}, ${5:3d}"),
  gt("milestone", "Milestone", "${1:Release} :milestone, ${2:m1}, ${3:2026-02-01}, 0d"),
  gt("vert", "Vertical marker", "${1:Deadline} :vert, ${2:2026-02-15}, 0d"),
];

const git = syntax("gitGraph");
const GIT: MermaidSnippet[] = [
  git("commit", "Commit", "commit"),
  git("commit-id", "Commit with id / tag / type", 'commit id: "${1:id}" tag: "${2:v1.0}" type: ${3|NORMAL,REVERSE,HIGHLIGHT|}'),
  git("branch", "Branch", "branch ${1:feature}"),
  git("checkout", "Checkout", "checkout ${1:main}"),
  git("switch", "Switch (alias of checkout)", "switch ${1:main}"),
  git("merge", "Merge", "merge ${1:feature}"),
  git("cherry-pick", "Cherry-pick", 'cherry-pick id: "${1:id}"'),
];

const mm = syntax("mindmap");
const MINDMAP: MermaidSnippet[] = [
  mm("node-square", "Node: square", "${1:id}[${2:Text}]"),
  mm("node-round", "Node: rounded", "${1:id}(${2:Text})"),
  mm("node-circle", "Node: circle", "${1:id}((${2:Text}))"),
  mm("node-bang", "Node: bang", "${1:id}))${2:Text}(("),
  mm("node-cloud", "Node: cloud", "${1:id})${2:Text}("),
  mm("node-hexagon", "Node: hexagon", "${1:id}{{${2:Text}}}"),
  mm("icon", "Icon on node", "::icon(${1:fa fa-book})"),
];

const tl = syntax("timeline");
const TIMELINE: MermaidSnippet[] = [
  tl("section", "Section", "section ${1:Period}"),
  tl("event", "Period with events", "${1:2026} : ${2:Event} : ${3:Another event}"),
];

const xy = syntax("xychart");
const XY: MermaidSnippet[] = [
  xy("x-axis", "X axis (categories)", "x-axis [${1:a, b, c}]"),
  xy("x-axis-range", "X axis (range)", 'x-axis "${1:Title}" ${2:0} --> ${3:100}'),
  xy("y-axis", "Y axis", 'y-axis "${1:Title}" ${2:0} --> ${3:100}'),
  xy("bar", "Bar series", "bar [${1:1, 2, 3}]"),
  xy("line", "Line series", "line [${1:1, 2, 3}]"),
  xy("horizontal", "Horizontal chart", "xychart horizontal"),
];

const arch = syntax("architecture");
const ARCH: MermaidSnippet[] = [
  arch("group", "Group", "group ${1:id}(${2|cloud,database,disk,internet,server|})[${3:Label}]"),
  arch("service", "Service", "service ${1:id}(${2|server,database,disk,internet,cloud|})[${3:Label}] in ${4:group}"),
  arch("junction", "Junction", "junction ${1:id}"),
  arch("edge", "Edge", "${1:a}:${2|L,R,T,B|} ${3|--,-->,<--,<-->|} ${4|L,R,T,B|}:${5:b}"),
];

const blk = syntax("block");
const BLOCK: MermaidSnippet[] = [
  blk("columns", "Columns", "columns ${1:3}"),
  blk("block", "Nested block", ["block:${1:id}", "  columns ${2:2}", "  $0", "end"]),
  blk("space", "Empty space", "space"),
  blk("arrow", "Arrow block", "${1:arrow}<[\"${2:label}\"]>(${3|right,left,up,down,x,y|})"),
];

const kb = syntax("kanban");
const KANBAN: MermaidSnippet[] = [
  kb("column", "Column", "${1:id}[${2:Column}]"),
  kb("card", "Card", "${1:id}[${2:Task}]"),
  kb("card-meta", "Card with metadata", "${1:id}[${2:Task}]@{ assigned: '${3:alice}', ticket: '${4:ABC-1}', priority: '${5|Very High,High,Low,Very Low|}' \\}"),
];

const req = syntax("requirementDiagram");
const REQUIREMENT: MermaidSnippet[] = [
  req("requirement", "Requirement", [
    "${1|requirement,functionalRequirement,interfaceRequirement,performanceRequirement,physicalRequirement,designConstraint|} ${2:name} {",
    "  id: ${3:1}",
    "  text: ${4:The user can log in}",
    "  risk: ${5|high,medium,low|}",
    "  verifymethod: ${6|test,analysis,inspection,demonstration|}",
    "}",
  ]),
  req("element", "Element", ["element ${1:name} {", "  type: ${2:simulation}", "  docref: ${3:ref}", "}"]),
  req("relationship", "Relationship", "${1:a} - ${2|contains,copies,derives,satisfies,verifies,refines,traces|} -> ${3:b}"),
];

const c4 = syntax("C4");
const C4: MermaidSnippet[] = [
  c4("Person", "Person", 'Person(${1:alias}, "${2:Label}", "${3:Description}")'),
  c4("Person_Ext", "External person", 'Person_Ext(${1:alias}, "${2:Label}", "${3:Description}")'),
  c4("System", "System", 'System(${1:alias}, "${2:Label}", "${3:Description}")'),
  c4("System_Ext", "External system", 'System_Ext(${1:alias}, "${2:Label}", "${3:Description}")'),
  c4("SystemDb", "System database", 'SystemDb(${1:alias}, "${2:Label}", "${3:Description}")'),
  c4("Container", "Container", 'Container(${1:alias}, "${2:Label}", "${3:Technology}", "${4:Description}")'),
  c4("ContainerDb", "Container database", 'ContainerDb(${1:alias}, "${2:Label}", "${3:Technology}", "${4:Description}")'),
  c4("Component", "Component", 'Component(${1:alias}, "${2:Label}", "${3:Technology}", "${4:Description}")'),
  c4("Boundary", "Boundary", ['${1|Boundary,Enterprise_Boundary,System_Boundary,Container_Boundary|}(${2:alias}, "${3:Label}") {', "  $0", "}"]),
  c4("Rel", "Relationship", 'Rel(${1:from}, ${2:to}, "${3:Label}", "${4:Technology}")'),
  c4("BiRel", "Bidirectional relationship", 'BiRel(${1:from}, ${2:to}, "${3:Label}")'),
  c4("UpdateLayoutConfig", "Layout config", 'UpdateLayoutConfig(\\$c4ShapeInRow="${1:3}", \\$c4BoundaryInRow="${2:1}")'),
];

export const MERMAID_SNIPPETS: MermaidSnippet[] = [
  ...DIAGRAMS,
  ...COMMON,
  ...FLOWCHART,
  ...SEQUENCE,
  ...CLASS,
  ...STATE,
  ...ER,
  ...GANTT,
  ...GIT,
  ...MINDMAP,
  ...TIMELINE,
  ...XY,
  ...ARCH,
  ...BLOCK,
  ...KANBAN,
  ...REQUIREMENT,
  ...C4,
];
