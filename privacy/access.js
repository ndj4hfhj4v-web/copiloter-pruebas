(() => {
'use strict';
const host=document.getElementById('infoView');if(!host||document.getElementById('copiloterPrivacyLink'))return;
const labels={es:'Política de privacidad',pt:'Política de privacidade',fr:'Politique de confidentialité',en:'Privacy policy',de:'Datenschutzerklärung',ro:'Politica de confidențialitate',ru:'Политика конфиденциальности',el:'Πολιτική απορρήτου',uk:'Політика конфіденційності'};
const line=document.createElement('p');line.id='copiloterPrivacyAccess';
const link=document.createElement('a');link.id='copiloterPrivacyLink';link.href='privacy/privacidad.html';link.target='_blank';link.rel='noopener noreferrer';
line.append(link);host.prepend(line);
function paint(){link.textContent=labels[window.I18n?.language]||labels[document.documentElement.lang?.split('-')[0]]||labels.es;}
window.addEventListener('copiloter-language-change',paint);paint();
})();
