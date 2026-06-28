const hash = window.top.location.hash;
const queryIndex = hash.indexOf('?');
const queryString = hash.substring(queryIndex + 1);
const params = new URLSearchParams(queryString);

const teiId = params.get('teiId');
const enrollmentId = params.get('enrollmentId');
const programId = params.get('programId');
const orgUnitId = params.get('orgUnitId');

//console.log('TEI ID =>'+teiId);
//console.log('ENROLLMENT ID =>'+enrollmentId);
//console.log('PROGRAM ID =>'+programId);
//console.log('ORG UNIT ID =>'+orgUnitId);

const iframe = window.frameElement;

window.addEventListener('load', function() {
	resizeIframe();
	//fetch('../../../api/dataStore/prints/config')
	fetch('../../../api/dataStore/cardDesigner')
	.then(response => response.json())
	.then(data => {
		data.forEach(card => {
			let path = (card.path) ? card.path : 'card.html';
			let a = document.createElement('a');
			let link = document.createTextNode(card.split(/(?=[A-Z])/)
					.map(word => word.charAt(0).toUpperCase() + word.slice(1))
					.join(" "));
			a.appendChild(link);
			a.title = card.split(/(?=[A-Z])/)
				.map(word => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");
			a.target = "_blank";
			a.href = '../../../api/apps/Patient-Cards/'+path+'?cardId='+card+'&teiId='+teiId+'&enrollmentId='+enrollmentId+'&programId='+programId+'&orgUnitId='+orgUnitId;
			document.getElementById("card-list").appendChild(a);
		});
	}).catch(error => {
		console.error('Error fetching JSON:', error);
	});
});

function resizeIframe() {
	const body = document.body;
	const html = document.documentElement;
	const height = Math.max(
		body.scrollHeight,
		body.offsetHeight,
		html.clientHeight,
		html.scrollHeight,
		html.offsetHeight
	);

	iframe.style.height = (height) + "px";
	iframe.style.border = "1px solid #d4d4d4";
	iframe.style.borderRadius = "5px";
	iframe.style.background = "#fff";
}