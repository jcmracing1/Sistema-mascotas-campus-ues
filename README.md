Mascotas UES - Multi (Local, GitHub Pages)
Instrucciones:
1. Subir todo el contenido de esta carpeta al repo en GitHub (branch main) y activar GitHub Pages (root).
2. La app usará ThingSpeak canal 3146056 (lectura) y espera que cada feed incluya field1=lat, field2=lng, optional field3=alt, and field4 or field5 = pet key (nessa/cleo/doguie).
3. Si no proporcionas el pet key, el sistema puede asignar un unassigned fallback; para fiabilidad incluye field4 con 'nessa', 'cleo' o 'doguie'.
4. La app hace polling cada 5s y muestra el historial (últimos puntos) y alertas de salida del campus.

Notas:
- localStorage no se usa: todo viene del canal ThingSpeak.
- Si quieres que las mascotas se puedan crear/editar desde la web y persistir, puedo añadir esa funcionalidad (usando JSONBin o backend).
