# 📋 Instrucciones para Deployar el Sistema de Pedidos

## ✅ Lo que ya está listo

- ✅ Archivo `appscript-pedidos.js` creado en `/resources/`
- ✅ Archivo `index.html` actualizado para usar form submit (sin CORS)
- ✅ Spreadsheet de pedidos creado: https://docs.google.com/spreadsheets/d/1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs/edit

## 🚀 Pasos para Implementar

### 1. Abrir el Spreadsheet de Pedidos

Ve a: https://docs.google.com/spreadsheets/d/1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs/edit

### 2. Abrir el Editor de Apps Script

1. En el spreadsheet, click en **Extensiones** → **Apps Script**
2. Se abrirá el editor de Google Apps Script

### 3. Pegar el Código

1. Si hay código existente, borralo
2. Copia TODO el contenido del archivo `/resources/appscript-pedidos.js`
3. Pegalo en el editor de Apps Script
4. Click en **💾 Guardar** (o Ctrl+S / Cmd+S)

### 4. Probar el Código (Opcional pero Recomendado)

1. En el dropdown de funciones (arriba), selecciona `testSaveOrder`
2. Click en **▶️ Ejecutar**
3. La primera vez te pedirá permisos:
   - Click en **Revisar permisos**
   - Selecciona tu cuenta de Google
   - Click en **Avanzado** → **Ir a [nombre del proyecto] (no seguro)**
   - Click en **Permitir**
4. Si todo está bien, verás en el log: "Test result: ..." y aparecerá un pedido de prueba en la pestaña "Santa Fe"

### 5. Desplegar como Aplicación Web

1. Click en **Implementar** (botón azul arriba a la derecha) → **Nueva implementación**
2. Configurar:
   - Click en el ⚙️ (icono de engranaje) al lado de "Selecciona el tipo"
   - Selecciona **Aplicación web**
   - **Descripción**: "API para guardar pedidos" (o lo que quieras)
   - **Ejecutar como**: **Yo** (tu email)
   - **Acceso**: **Cualquier persona**
3. Click en **Implementar**
4. Te pedirá autorizar de nuevo, acepta
5. **¡IMPORTANTE!** Copia la **URL de implementación** que aparece. Debe terminar en `/exec`

### 6. Actualizar index.html

1. Abre el archivo `index.html`
2. Busca la línea ~117:
   ```javascript
   const ORDERS_URL = 'TU_URL_DE_APPSCRIPT_PEDIDOS_AQUI';
   ```
3. Reemplaza `'TU_URL_DE_APPSCRIPT_PEDIDOS_AQUI'` con la URL que copiaste en el paso anterior
4. Debe quedar algo así:
   ```javascript
   const ORDERS_URL = 'https://script.google.com/macros/s/AKfycby.../exec';
   ```
5. Guarda el archivo

### 7. Probar en tu Web

1. Abre tu tienda en el navegador
2. Agrega productos al carrito
3. Llena los datos del cliente
4. Click en **Enviar por WhatsApp**
5. Deberías ver: "Guardando pedido..." → "✓ Guardado! Abriendo WhatsApp..."
6. Verifica en el spreadsheet de pedidos que se haya guardado correctamente

---

## 🔍 Verificación

### El pedido debe aparecer en:
- **Spreadsheet**: https://docs.google.com/spreadsheets/d/1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs/edit
- **Pestaña**: "Santa Fe" o "Buenos Aires" (según el lugar seleccionado)
- **Datos incluidos**: Timestamp, Nombre, Teléfono, Dirección, Zona, Lugar, Detalle de Productos, Subtotal, Envío, Total, Notas

### Formato del Detalle de Productos:
```
[COD123] Producto 1 (Variante) x2 = $3000.00
[COD456] Producto 2 (Variante) x1 = $1500.00
```

---

## ❓ Solución de Problemas

### Si el botón dice "URL de pedidos no configurada":
- Verificá que hayas actualizado `ORDERS_URL` en el `index.html` (paso 6)

### Si aparece un error de permisos:
- Asegurate de haber autorizado el script en el paso 4
- Verifica que el deployment esté configurado con acceso "Cualquier persona"

### Si no se guarda nada:
1. Abre la consola del navegador (F12)
2. Mira si hay errores
3. Verifica en el log de Apps Script (View → Logs) si llegó alguna petición

### Para ver logs del Apps Script:
1. En el editor de Apps Script
2. Click en **Ver** → **Registros de ejecución**
3. Ahí verás todas las peticiones que llegaron

---

## 🎉 ¡Listo!

Una vez completados estos pasos, cada pedido se guardará automáticamente en el spreadsheet antes de abrir WhatsApp. Los datos quedarán organizados por lugar (Santa Fe / Buenos Aires) y listos para análisis posterior.

## 📝 Próximos Pasos (Opcional)

En el futuro podés:
- Crear un dashboard con gráficos de ventas
- Automatizar reportes diarios/semanales
- Parsear el "Detalle de Productos" para análisis más profundos
- Agregar más lugares/pestañas según lo necesites

