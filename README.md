Mascotas UES - Versión Local (GitHub Pages)

Instrucciones rápidas:
1. Descomprime este ZIP y sube los archivos a un repositorio GitHub (branch main).
2. Activa GitHub Pages (Settings -> Pages -> selecciona main branch / root).
3. Abre la URL pública de GitHub Pages. La app funciona 100% en el navegador.
4. Agrega mascotas (nombre, descripción, foto). Los datos se guardan en localStorage.
5. Asegúrate que ThingSpeak publique en el canal 3146056 (field1 = lat, field2 = lng).
6. La app hará polling cada 15s y guardará una visita solo cuando cambie la ubicación.

Notas:
- localStorage es por navegador; si borras caché los datos se pierden.
- Si quieres compartir mascotas entre usuarios, podemos cambiar a JSONBin/similar después.
