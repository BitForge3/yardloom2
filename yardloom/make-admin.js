// Usage: node make-admin.js you@example.com   (register on the site first)
const Database=require('better-sqlite3');
const db=new Database(process.env.DB_PATH||'yardloom.db');
const r=db.prepare("update users set role='admin',email_ok=1 where email=?").run(String(process.argv[2]||'').toLowerCase());
console.log(r.changes?'Done. That account is now an admin.':'No account with that email. Register on the site first.');
