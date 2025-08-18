# Nimú - Tienda Consciente

![Vista previa](./imgs/preview.png) <!-- Si tienes una imagen de preview, agrégala aquí; de lo contrario, quita esta línea -->

Nimú es una aplicación web simple para una tienda dietética o de productos conscientes. Permite explorar un catálogo de productos por categorías, agregar items a un carrito y enviar pedidos directamente por WhatsApp. Todo construido con HTML, CSS y JavaScript puros, sin frameworks ni dependencias externas.

## Características
- **Catálogo dinámico**: Productos organizados por categorías con búsqueda y filtros.
- **Carrito de compras**: Agrega/remueve items, calcula totales y maneja envíos.
- **Pedido por WhatsApp**: Genera un mensaje preformateado con el detalle del pedido para enviar al vendedor.
- **Configuración fácil**: Edita productos, precios y opciones en el código JS (sección CONFIG).
- **Modo offline básico**: Funciona como PWA simple (agrega a home screen).
- **Tema oscuro**: Diseño responsive y moderno con gradientes y sombras.

## Instalación y Uso
1. Clona el repositorio:
   ```
   git clone https://github.com/pablojorgeandres/tienda-nimu.git
   ```
2. Abre `index.html` en tu navegador (no necesita servidor).
3. Para deploy: Sube los archivos a un hosting estático (ej. GitHub Pages, Netlify, Vercel).

## Configuración
- Edita la sección `/************ CONFIG ************/` en `index.html` para cambiar:
  - Nombre de la tienda (`STORE.name`).
  - Número de WhatsApp (`STORE.phone`).
  - Opciones de envío y umbral de envío gratis.
  - Lista de productos (array `DEFAULT_PRODUCTS` o carga remota vía `PRODUCTS_URL`).
- Para cargar productos desde un backend (ej. Google Sheets), configura `PRODUCTS_URL` con una URL que devuelva JSON.

## Ejecución Local
- Abre `index.html` en Chrome/Firefox.
- Prueba agregando productos al carrito y enviando por WhatsApp.

## Contribuciones
¡Bienvenidas! Abre un issue o pull request en GitHub para sugerencias o fixes.

## Licencia
MIT License. Usa y modifica libremente.

Hecho con ❤️ por Pablo Jorge Andrés.
