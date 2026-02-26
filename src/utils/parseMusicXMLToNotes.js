export function parseMusicXMLToNotes(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const divisionsNode = xmlDoc.querySelector("divisions");
  const divisions = divisionsNode ? parseInt(divisionsNode.textContent) : 1;

  const tempoNode = xmlDoc.querySelector("sound[tempo]");
  const tempo = tempoNode ? parseFloat(tempoNode.getAttribute("tempo")) : 120;

  const noteElements = xmlDoc.getElementsByTagName("note");

  const notes = [];
  let currentTime = 0;

  for (let i = 0; i < noteElements.length; i++) {
    const noteElem = noteElements[i];

    const isRest = noteElem.getElementsByTagName("rest").length > 0;
    const durationElem = noteElem.getElementsByTagName("duration")[0];
    const durationVal = durationElem ? parseInt(durationElem.textContent) : 0;

    const durationInBeats = durationVal / divisions;

    if (!isRest) {
      const pitchElem = noteElem.getElementsByTagName("pitch")[0];
      if (pitchElem) {
        const step = pitchElem.getElementsByTagName("step")[0].textContent;
        const octave = pitchElem.getElementsByTagName("octave")[0].textContent;
        const alterElem = pitchElem.getElementsByTagName("alter")[0];
        const alter = alterElem ? parseInt(alterElem.textContent) : 0;

        let noteName = step;

        if (alter === 1) {
          noteName += "#";  // sostenido
        } else if (alter === -1) {
          noteName += "b";  // bemol, conservar la 'b'
        }

        noteName += octave;

        notes.push({
          note: noteName,
          time: currentTime,
          duration: durationInBeats,
        });
      }
    }

    currentTime += durationInBeats;
  }

  return { notes, tempo };
}
