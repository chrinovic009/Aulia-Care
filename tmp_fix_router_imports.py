from pathlib import Path
root = Path("frontend/src")
modified = []
for path in root.rglob("*.ts*"):
    text = path.read_text(encoding="utf-8")
    new_text = text.replace('from "react-router"', 'from "react-router-dom"').replace("from 'react-router'", "from 'react-router-dom'")
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        modified.append(str(path))
print('modified', len(modified), 'files')
for p in modified:
    print(p)
