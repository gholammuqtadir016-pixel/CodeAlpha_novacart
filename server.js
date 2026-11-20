import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const root = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(root, 'data'), { recursive: true });
const db = new DatabaseSync(path.join(root, 'data', 'store.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
// Node's built-in SQLite has no transaction helper; keep order placement atomic.
db.transaction = (callback) => (...args) => {
 db.exec('BEGIN IMMEDIATE');
 try {
  const result = callback(...args);
  db.exec('COMMIT');
  return result;
 } catch (error) {
  db.exec('ROLLBACK');
  throw error;
 }
};
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price >= 0), original_price INTEGER, image TEXT NOT NULL,
 rating REAL NOT NULL DEFAULT 4.5, stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
 featured INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Confirmed',
 recipient TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL,
 pincode TEXT NOT NULL, payment_method TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id),
 product_id INTEGER NOT NULL REFERENCES products(id), name TEXT NOT NULL,
 quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL
);
`);
const images = {
 headphones:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&q=85',
 watch:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&q=85',
 speaker:'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=900&q=85',
 camera:'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=900&q=85',
 shoes:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=85',
 bag:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&q=85',
 glasses:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=900&q=85',
 jacket:'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=900&q=85',
 lamp:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=900&q=85',
 chair:'https://images.unsplash.com/photo-1503602642458-232111445657?w=900&q=85',
 keyboard:'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=900&q=85',
 bottle:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=900&q=85'
};
const products = [
[1,'Studio Wireless Headphones','Electronics','Premium over-ear wireless headphones with a balanced sound profile, soft ear cushions and all-day comfort.',4999,6999,images.headphones,4.9,24,1],
[2,'Minimalist Smart Watch','Electronics','Stay connected with fitness tracking, notifications, a vivid display and an elegant everyday design.',7499,9999,images.watch,4.8,18,1],
[3,'Portable Bluetooth Speaker','Electronics','Compact speaker with powerful sound, wireless connectivity and a rechargeable battery.',3299,4499,images.speaker,4.7,30,0],
[4,'Classic Mirrorless Camera','Electronics','Capture beautiful everyday moments with intuitive controls and impressive image clarity.',42999,49999,images.camera,4.9,8,0],
[5,'Velocity Runner Sneakers','Fashion','Lightweight, breathable trainers designed for comfort on the move.',3899,5299,images.shoes,4.8,32,1],
[6,'Urban Explorer Backpack','Fashion','Durable everyday backpack with organized storage and a clean modern silhouette.',2499,3499,images.bag,4.7,27,0],
[7,'Everyday Sunglasses','Fashion','Timeless frames with comfortable fitting and UV-protective lenses.',1599,2299,images.glasses,4.6,45,0],
[8,'Heritage Leather Jacket','Fashion','A standout layering piece with a refined cut and timeless style.',8999,11999,images.jacket,4.8,12,0],
[9,'Ambient Table Lamp','Home & Living','Warm up your space with a contemporary lamp made for relaxed evenings.',2999,3999,images.lamp,4.7,21,1],
[10,'Nordic Accent Chair','Home & Living','A comfortable design-forward chair that adds character to any living space.',12999,15999,images.chair,4.9,9,0],
[11,'Mechanical Keyboard','Electronics','Responsive mechanical keys, an easy-to-use layout and a satisfying typing experience.',5499,6999,images.keyboard,4.8,17,0],
[12,'Insulated Water Bottle','Lifestyle','Durable reusable bottle for refreshment at home, work or on the go.',1299,1799,images.bottle,4.6,55,0]
];
if (db.prepare('SELECT COUNT(*) AS count FROM products').get().count === 0) {
 const insert = db.prepare('INSERT INTO products (id,name,category,description,price,original_price,image,rating,stock,featured) VALUES (?,?,?,?,?,?,?,?,?,?)');
 db.transaction(() => products.forEach(p => insert.run(...p)))();
}
const app = express();
const isProd = process.env.NODE_ENV === 'production';
const secret = process.env.JWT_SECRET || (isProd ? '' : 'local-dev-only-secret-change-this-before-deployment');
if (secret.length < 32) throw new Error('Set JWT_SECRET in .env to at least 32 characters');
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy: false}));
app.use(express.json({limit:'30kb'}));
app.use(cookieParser());
app.use((req,res,next)=>{
 if(['POST','PUT','PATCH','DELETE'].includes(req.method) && req.headers.origin){
  try {const origin=new URL(req.headers.origin);const host=req.get('host');if(origin.host!==host)return res.status(403).json({error:'Cross-site requests are not allowed.'});}
  catch {return res.status(403).json({error:'Invalid request origin.'});}
 }
 next();
});
app.use('/api/auth', rateLimit({windowMs:15*60*1000, limit:30, standardHeaders:'draft-7', legacyHeaders:false}));
const COOKIE = 'novacart_session';
function sendAuth(res,user,status=200){
 const token=jwt.sign({sub:user.id},secret,{expiresIn:'7d'});
 res.cookie(COOKIE, token,{httpOnly:true,secure:isProd,sameSite:'lax',path:'/',maxAge:7*24*3600*1000});
 return res.status(status).json({user:{id:user.id,name:user.name,email:user.email}});
}
function currentUser(req){
 try { const payload=jwt.verify(req.cookies[COOKIE],secret); return db.prepare('SELECT id,name,email FROM users WHERE id=?').get(Number(payload.sub)) || null; }
 catch {return null;}
}
function requireAuth(req,res,next){req.user=currentUser(req); if(!req.user) return res.status(401).json({error:'Please sign in to continue.'}); next();}
function validate(schema,req,res,next){const parsed=schema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:parsed.error.issues[0]?.message || 'Invalid information'}); req.validated=parsed.data;next();}
const signupSchema=z.object({name:z.string().trim().min(2).max(70),email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),password:z.string().min(8).max(100)}).strict();
const loginSchema=z.object({email:z.string().trim().email().transform(x=>x.toLowerCase()),password:z.string().min(1)}).strict();
app.post('/api/auth/register',(req,res,next)=>validate(signupSchema,req,res,()=>{
 const {name,email,password}=req.validated;
 if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({error:'An account with this email already exists.'});
 try {const info=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name,email,bcrypt.hashSync(password,12));return sendAuth(res,{id:Number(info.lastInsertRowid),name,email},201);}catch(e){next(e);}
}));
app.post('/api/auth/login',(req,res,next)=>validate(loginSchema,req,res,()=>{
 const {email,password}=req.validated;
 const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if(!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:'Incorrect email or password.'});
 return sendAuth(res,user);
}));
app.post('/api/auth/logout',(_req,res)=>{res.clearCookie(COOKIE,{httpOnly:true,secure:isProd,sameSite:'lax',path:'/'});res.json({message:'Signed out'});});
app.get('/api/auth/me',(req,res)=>res.json({user:currentUser(req)}));
app.get('/api/products',(req,res)=>{
 const {category,search,sort}=req.query;
 let sql='SELECT * FROM products WHERE 1=1';let args=[];
 if(typeof category==='string' && category && category!=='All'){sql+=' AND category=?';args.push(category);}
 if(typeof search==='string' && search.trim()){sql+=' AND (name LIKE ? OR description LIKE ?)';args.push(`%${search.trim().slice(0,80)}%`,`%${search.trim().slice(0,80)}%`);}
 const order={newest:'id DESC',price_low:'price ASC',price_high:'price DESC',rating:'rating DESC',featured:'featured DESC, id ASC'};
 sql+=' ORDER BY '+(order[sort]||order.featured);
 res.json({products:db.prepare(sql).all(...args)});
});
app.get('/api/products/:id',(req,res)=>{
 const product=db.prepare('SELECT * FROM products WHERE id=?').get(Number(req.params.id));
 if(!product)return res.status(404).json({error:'Product not found'});res.json({product});
});
const orderSchema=z.object({
 recipient:z.string().trim().min(2).max(80),phone:z.string().regex(/^[0-9+()\-\s]{10,18}$/,'Enter a valid phone number'),
 address:z.string().trim().min(8).max(250),city:z.string().trim().min(2).max(70),
 pincode:z.string().regex(/^\d{6}$/,'Enter a valid 6-digit PIN code'),
 payment_method:z.literal('COD'),
 items:z.array(z.object({product_id:z.number().int().positive(),quantity:z.number().int().min(1).max(20)}).strict()).min(1).max(50)
}).strict();
const placeOrder=db.transaction((userId,data)=>{
 const grouped=new Map();for(const item of data.items)grouped.set(item.product_id,(grouped.get(item.product_id)||0)+item.quantity);
 let subtotal=0;const lines=[];
 for(const [id,quantity] of grouped){
  if(quantity>20) throw Object.assign(new Error('Maximum 20 units per product.'),{status:400});
  const p=db.prepare('SELECT id,name,price,stock FROM products WHERE id=?').get(id);
  if(!p) throw Object.assign(new Error('One of the products is unavailable.'),{status:400});
  if(p.stock<quantity) throw Object.assign(new Error(`Only ${p.stock} units of ${p.name} available.`),{status:409});
  subtotal+=p.price*quantity;lines.push({product:p,quantity});
 }
 const shipping=subtotal>=2999?0:99;
 const total=subtotal+shipping;
 const result=db.prepare('INSERT INTO orders(user_id,total,recipient,phone,address,city,pincode,payment_method) VALUES(?,?,?,?,?,?,?,?)')
  .run(userId,total,data.recipient,data.phone,data.address,data.city,data.pincode,data.payment_method);
 const orderId=Number(result.lastInsertRowid);
 for(const {product:p,quantity} of lines){
  db.prepare('INSERT INTO order_items(order_id,product_id,name,quantity,unit_price) VALUES(?,?,?,?,?)').run(orderId,p.id,p.name,quantity,p.price);
  db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(quantity,p.id);
 }
 return {id:orderId,total,shipping};
});
app.post('/api/orders',requireAuth,(req,res,next)=>validate(orderSchema,req,res,()=>{
 try{res.status(201).json({order:placeOrder(req.user.id,req.validated)});}catch(e){next(e);}
}));
app.get('/api/orders',requireAuth,(req,res)=>{
 const orders=db.prepare('SELECT id,total,status,recipient,city,payment_method,created_at FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
 const items=db.prepare('SELECT product_id,name,quantity,unit_price FROM order_items WHERE order_id=?');
 res.json({orders:orders.map(o=>({...o,items:items.all(o.id)}))});
});
app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found'}));
app.use(express.static(path.join(root,'public')));
app.get('*',(_req,res)=>res.sendFile(path.join(root,'public','index.html')));
app.use((err,_req,res,_next)=>{console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Something went wrong. Please try again.'});});
const port=Number(process.env.PORT)||3000;
app.listen(port,()=>console.log(`NovaCart running at http://localhost:${port}`));
